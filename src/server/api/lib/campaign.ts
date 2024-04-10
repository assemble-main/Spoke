/* eslint-disable import/prefer-default-export */
import type {
  Campaign,
  CampaignInput,
  CampaignsFilter
} from "@spoke/spoke-codegen";
import isEmpty from "lodash/isEmpty";
import isEqual from "lodash/isEqual";
import isNil from "lodash/isNil";
import type { QueryResult } from "pg";
import MemoizeHelper, { Buckets, cacheOpts } from "src/server/memoredis";

import type { RelayPaginatedResponse } from "../../../api/pagination";
import { config } from "../../../config";
import { gzip, makeTree } from "../../../lib";
import { parseIanaZone } from "../../../lib/datetime";
import { allScriptFields } from "../../../lib/scripts";
import {
  loadContactsFromDataWarehouse,
  uploadContacts
} from "../../../workers/jobs";
import type { SpokeDbContext } from "../../contexts/types";
import { cacheableData, datawarehouse, r } from "../../models";
import { addAssignTexters } from "../../tasks/assign-texters";
import { accessRequired } from "../errors";
import type {
  CampaignRecord,
  InteractionStepRecord,
  UserRecord
} from "../types";
import { processContactsFile } from "./edit-campaign";
import { persistInteractionStepTree } from "./interaction-steps";
import { formatPage } from "./pagination";

const { JOBS_SAME_PROCESS } = config;

interface DoGetCampaignsOptions extends CampaignsFilter {
  first?: number;
  after?: string;
}

interface GetCampaignsOptions {
  first?: number;
  after?: string;
  filter?: CampaignsFilter;
}

type DoGetCampaigns = (
  options: DoGetCampaignsOptions
) => Promise<RelayPaginatedResponse<Campaign>>;

export const doGetCampaigns: DoGetCampaigns = async (
  options: DoGetCampaignsOptions
) => {
  const { after, first, organizationId, campaignId, isArchived } = options;

  const query = r.reader("campaign").select("*");

  // Filter options
  if (organizationId) {
    query.where({ organization_id: organizationId });
  }

  if (campaignId) {
    query.where({ id: campaignId });
  }

  if (!isNil(isArchived)) {
    query.where({ is_archived: isArchived });
  }

  const pagerOptions = { first, after };
  return formatPage(query, pagerOptions);
};

export const getCampaigns = async ({
  after,
  first,
  filter
}: GetCampaignsOptions) => {
  const memoizer = await MemoizeHelper.getMemoizer();
  const memoizedCampaigns = MemoizeHelper.hasBucketConfigured(Buckets.Advanced)
    ? memoizer.memoize(doGetCampaigns, cacheOpts.CampaignsList)
    : doGetCampaigns;

  return memoizedCampaigns({ after, first, ...filter });
};

interface DeliverabilityStatRow {
  count: string;
  send_status: string;
  error_codes: string[] | null;
}

interface DeliverabilityStatsFilter {
  initialMessagesOnly?: boolean;
}

export const getDeliverabilityStats = async (
  campaignId: number,
  filter: DeliverabilityStatsFilter = {}
) => {
  const { initialMessagesOnly = false } = filter;

  const selectClause = initialMessagesOnly
    ? "select distinct on (campaign_contact_id)"
    : "select";
  const orderClause = initialMessagesOnly
    ? "order by campaign_contact_id, message.id asc"
    : "";

  const isArchived = await r
    .reader<CampaignRecord>("campaign")
    .where({ id: campaignId })
    .first("is_archived")
    .then((res) => res?.is_archived);

  const rows = await r.reader
    .raw(
      `
        with messages_for_stats as (
          ${selectClause}
            send_status,
            coalesce(error_codes, '{}') as error_codes
          from message
          join campaign_contact on campaign_contact.id = message.campaign_contact_id
          where campaign_contact.campaign_id = ?
            and is_from_contact = false
            and archived = ${isArchived ?? false}
          ${orderClause}
        )
        select count(*), send_status, error_codes
        from messages_for_stats
        group by 2, 3
      `,
      [campaignId]
    )
    .then((res: { rows: DeliverabilityStatRow[] }) => {
      // The `count` column is returned as a string so we parse it ourselves
      return res.rows.map(({ count, ...row }) => ({
        ...row,
        count: parseInt(count, 10)
      }));
    });

  const result = {
    deliveredCount: rows.find((o) => o.send_status === "DELIVERED")?.count || 0,
    sendingCount: rows.find((o) => o.send_status === "SENDING")?.count || 0,
    sentCount: rows.find((o) => o.send_status === "SENT")?.count || 0,
    errorCount:
      rows
        .filter((o) => o.send_status === "ERROR")
        .reduce((a, b) => ({ count: a.count + b.count }), { count: 0 }).count ||
      0,
    specificErrors: rows
      .filter((o) => o.send_status === "ERROR")
      .map((o) => ({
        errorCode:
          o.error_codes && o.error_codes.length > 0 ? o.error_codes[0] : null,
        count: o.count
      }))
  };

  return result;
};

export interface CopyCampaignOptions {
  db: SpokeDbContext;
  campaignId: number;
  userId: number;
  quantity?: number;
  template?: boolean;
  targetOrgId?: number | null;
}

export const copyCampaign = async (options: CopyCampaignOptions) => {
  const {
    db,
    campaignId,
    userId,
    quantity = 1,
    template,
    targetOrgId = null
  } = options;

  const result = await db.primary.transaction(async (trx) => {
    const cloneSingle = async (count: number) => {
      // Copy campaign
      const {
        rows: [newCampaign]
      } = await trx.raw<QueryResult<CampaignRecord>>(
        `
          insert into campaign (
            organization_id,
            title,
            description,
            is_approved,
            is_started,
            is_archived,
            due_by,
            logo_image_url,
            intro_html,
            primary_color,
            texting_hours_start,
            texting_hours_end,
            timezone,
            creator_id,
            is_autoassign_enabled,
            limit_assignment_to_teams,
            replies_stale_after_minutes,
            external_system_id
          )
          select
            coalesce(?, organization_id),
            (case
              when is_template then replace(concat('COPY - ', title), '#', ?::text)
              else 'COPY - ' || title
            end),
            description,
            false as is_approved,
            false as is_started,
            false as is_archived,
            due_by,
            logo_image_url,
            intro_html,
            primary_color,
            texting_hours_start,
            texting_hours_end,
            timezone,
            ? as creator_id,
            false as is_autoassign_enabled,
            limit_assignment_to_teams,
            replies_stale_after_minutes,
            external_system_id
          from all_campaign
          where id = ?
          returning *
        `,
        [targetOrgId, count, userId, campaignId]
      );

      if (template) {
        await trx("all_campaign")
          .update({ is_template: true })
          .where({ id: newCampaign.id });
      }

      if (!template) {
        // Copy Messaging Service OR use active one
        const messagingServices = await r
          .knex("messaging_service")
          .where({
            organization_id: newCampaign.organization_id,
            active: true
          })
          .orderByRaw(`is_default desc nulls last`);

        if (messagingServices.length === 0) {
          throw new Error("No active messaging services found");
        }

        await trx("campaign")
          .update({
            messaging_service_sid: messagingServices[0].messaging_service_sid
          })
          .where({ id: newCampaign.id });
      }

      // Copy interactions
      const interactions = await trx<InteractionStepRecord>("interaction_step")
        .where({
          campaign_id: campaignId,
          is_deleted: false
        })
        .then((interactionSteps) =>
          interactionSteps.map<InteractionStepRecord | { id: string }>(
            (interactionStep) => ({
              id: `new${interactionStep.id}`,
              questionText: interactionStep.question,
              scriptOptions: interactionStep.script_options,
              answerOption: interactionStep.answer_option,
              answerActions: interactionStep.answer_actions,
              isDeleted: interactionStep.is_deleted,
              campaign_id: newCampaign.id,
              parentInteractionId: interactionStep.parent_interaction_id
                ? `new${interactionStep.parent_interaction_id}`
                : interactionStep.parent_interaction_id
            })
          )
        );

      if (interactions.length > 0) {
        await persistInteractionStepTree(
          newCampaign.id,
          makeTree(interactions, null /* id */),
          { is_started: false },
          trx
        );
      }

      // Copy canned responses
      await trx.raw(
        `
          insert into canned_response (campaign_id, title, text, display_order)
          select
            ? as campaign_id,
            title,
            text,
            display_order
          from canned_response
          where campaign_id = ?
        `,
        [newCampaign.id, campaignId]
      );

      // Copy Teams
      await trx.raw(
        `
          with target_org as (select ?::int as id)
          insert into campaign_team (campaign_id, team_id)
          select
            ? as campaign_id,
            team_id
          from campaign_team ct
          join team t on ct.team_id = t.id
          where campaign_id = ? 
          and exists (-- don't copy teams from another organization
            select 1 from target_org where target_org.id is null 
            or target_org.id = t.organization_id
          )
        `,
        [targetOrgId, newCampaign.id, campaignId]
      );

      if (!template) {
        // Copy Campaign Groups
        await trx.raw(
          `
            insert into campaign_group_campaign (campaign_id, campaign_group_id)
            select
              ? as campaign_id,
              campaign_group_id
            from campaign_group_campaign
            where campaign_id = ?
        `,
          [newCampaign.id, campaignId]
        );
      }

      // Copy Campaign Variables
      await trx.raw(
        `
          insert into campaign_variable (campaign_id, display_order, name, value)
          select
            ? as campaign_id,
            display_order,
            campaign_variable.name,
            (case
              when all_campaign.is_template then null
              else campaign_variable.value
            end)
          from campaign_variable
          join all_campaign on all_campaign.id = campaign_variable.campaign_id
          where
            campaign_id = ?
            and deleted_at is null
        `,
        [newCampaign.id, campaignId]
      );

      return newCampaign;
    };

    const newCampaigns = await Promise.all(
      [...Array(quantity)].map((_, idx) => cloneSingle(idx + 1))
    );
    return newCampaigns;
  });

  return result;
};

export const editCampaign = async (
  id: number,
  campaign: CampaignInput,
  loaders: any,
  user: UserRecord,
  origCampaignRecord: CampaignRecord,
  requiresApproval = false
) => {
  const unstartIfNecessary = async () => {
    if (
      !origCampaignRecord.is_template &&
      !user.is_superadmin &&
      requiresApproval
    ) {
      await r
        .knex("campaign")
        .update({ is_started: false, is_approved: false })
        .where({ id });
    }
  };

  // Prevent editing protected template fields
  if (origCampaignRecord.is_template) {
    // Texting hours
    campaign.textingHoursStart = null;
    campaign.textingHoursEnd = null;
    campaign.timezone = null;
    // Contacts
    campaign.externalListId = null;
    campaign.contactsFile = null;
    campaign.contacts = null;
    campaign.contactSql = null;
    // Texters
    campaign.texters = null;
    // Autoassignment
    campaign.isAutoassignEnabled = null;
    campaign.repliesStaleAfter = null;
    // Messaging Service
    campaign.messagingServiceSid = null;
  }

  const {
    title,
    description,
    dueBy,
    useDynamicAssignment: _useDynamicAssignment,
    logoImageUrl,
    introHtml,
    primaryColor,
    textingHoursStart,
    textingHoursEnd,
    isAutoassignEnabled,
    repliesStaleAfter,
    timezone,
    externalSystemId,
    messagingServiceSid,
    columnMapping
  } = campaign;

  const organizationId = origCampaignRecord.organization_id;
  const campaignUpdates: Partial<CampaignRecord> = {
    id,
    title: title ?? undefined,
    description: description ?? undefined,
    due_by: dueBy,
    organization_id: organizationId,
    // TODO: re-enable once dynamic assignment is fixed (#548)
    // use_dynamic_assignment: useDynamicAssignment,
    logo_image_url: logoImageUrl,
    primary_color: primaryColor,
    intro_html: introHtml,
    texting_hours_start: textingHoursStart ?? undefined,
    texting_hours_end: textingHoursEnd ?? undefined,
    is_autoassign_enabled: isAutoassignEnabled ?? undefined,
    replies_stale_after_minutes: repliesStaleAfter, // this is null to unset it - it must be null, not undefined
    timezone: timezone ? parseIanaZone(timezone) : undefined,
    external_system_id: externalSystemId,
    messaging_service_sid: messagingServiceSid ?? undefined
  };

  Object.keys(campaignUpdates).forEach((key) => {
    if (typeof campaignUpdates[key as keyof CampaignRecord] === "undefined") {
      delete campaignUpdates[key as keyof CampaignRecord];
    }
  });

  if (
    Object.prototype.hasOwnProperty.call(campaign, "externalListId") &&
    campaign.externalListId
  ) {
    await r.knex("campaign_contact").where({ campaign_id: id }).delete();
    await r.knex("filtered_contact").where({ campaign_id: id }).delete();
    await r
      .knex("campaign")
      .where({ id })
      .update({ landlines_filtered: false });
    await r.knex.raw(
      `select * from public.queue_load_list_into_campaign(?, ?)`,
      [id, parseInt(campaign.externalListId, 10)]
    );
  }

  let validationStats = {};
  if (
    Object.prototype.hasOwnProperty.call(campaign, "contactsFile") &&
    campaign.contactsFile
  ) {
    const processedContacts = await processContactsFile({
      file: campaign.contactsFile,
      columnMapping
    });
    campaign.contacts = processedContacts.contacts;
    validationStats = processedContacts.validationStats;

    await r.knex.raw(
      `
        ? ON CONFLICT (campaign_id)
        DO UPDATE SET column_mapping = EXCLUDED.column_mapping, updated_at = CURRENT_TIMESTAMP 
        RETURNING *;
      `,
      [
        r.knex("campaign_contact_upload").insert({
          campaign_id: id,
          column_mapping: JSON.stringify(columnMapping)
        })
      ]
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(campaign, "contacts") &&
    campaign.contacts &&
    !isEmpty(campaign.contacts)
  ) {
    await accessRequired(user, organizationId, "ADMIN", /* superadmin */ true);

    // Uploading contacts from a CSV invalidates external system configuration
    // and invalidates filtered landlines
    await r
      .knex("campaign")
      .update({
        external_system_id: null,
        landlines_filtered: false
      })
      .where({ id });

    const contactsToSave = campaign.contacts.map((datum) => {
      const modelData = {
        campaign_id: id,
        first_name: datum.firstName,
        last_name: datum.lastName,
        cell: datum.cell,
        external_id: datum.external_id,
        custom_fields: datum.customFields,
        message_status: "needsMessage",
        is_opted_out: false,
        zip: datum.zip || ""
      };
      modelData.campaign_id = id;
      return modelData;
    });
    const jobPayload = {
      excludeCampaignIds: campaign.excludeCampaignIds || [],
      contacts: contactsToSave,
      filterOutLandlines: campaign.filterOutLandlines,
      validationStats
    };
    const compressedString = await gzip(JSON.stringify(jobPayload));
    const [job] = await r
      .knex("job_request")
      .insert({
        queue_name: `${id}:edit_campaign`,
        job_type: "upload_contacts",
        locks_queue: true,
        assigned: JOBS_SAME_PROCESS, // can get called immediately, below
        campaign_id: id,
        // NOTE: stringifying because compressedString is a binary buffer
        payload: compressedString.toString("base64")
      })
      .returning("*");
    if (JOBS_SAME_PROCESS) {
      uploadContacts(job);
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(campaign, "contactSql") &&
    datawarehouse &&
    user.is_superadmin
  ) {
    await r
      .knex("campaign")
      .update({
        external_system_id: null,
        landlines_filtered: false
      })
      .where({ id });
    await accessRequired(user, organizationId, "ADMIN", /* superadmin */ true);
    const [job] = await r
      .knex("job_request")
      .insert({
        queue_name: `${id}:edit_campaign`,
        job_type: "upload_contacts_sql",
        locks_queue: true,
        assigned: JOBS_SAME_PROCESS, // can get called immediately, below
        campaign_id: id,
        payload: campaign.contactSql
      })
      .returning("*");
    if (JOBS_SAME_PROCESS) {
      loadContactsFromDataWarehouse(job);
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(campaign, "isAssignmentLimitedToTeams")
  ) {
    await r
      .knex("all_campaign")
      .update({
        limit_assignment_to_teams: campaign.isAssignmentLimitedToTeams
      })
      .where({ id });
  }
  if (Object.prototype.hasOwnProperty.call(campaign, "teamIds")) {
    await r.knex.transaction(async (trx) => {
      // Remove all existing team memberships and then add everything again
      await trx("campaign_team").where({ campaign_id: id }).del();
      await trx("campaign_team").insert(
        campaign.teamIds.map((team_id) => ({
          team_id,
          campaign_id: id
        }))
      );
    });
  }
  if (Object.prototype.hasOwnProperty.call(campaign, "campaignGroupIds")) {
    const campaignGroupIds = campaign.campaignGroupIds ?? [];
    await r.knex.transaction(async (trx) => {
      // Remove all existing team memberships and then add everything again
      await trx.raw(
        `
          delete from campaign_group_campaign
          where
            campaign_id = ?
            and campaign_group_id in (
              select id
              from campaign_group
              where
                organization_id = ?
                and id != ALL(?)
            )
        `,
        [id, organizationId, campaignGroupIds]
      );

      if (campaignGroupIds.length < 1) return;
      const valuesStr = [...Array(campaignGroupIds.length)]
        .map(() => "(?, ?)")
        .join(", ");
      await trx.raw(
        `
          insert into campaign_group_campaign (campaign_group_id, campaign_id)
          values ${valuesStr}
          on conflict (campaign_group_id, campaign_id) do nothing
        `,
        campaignGroupIds.flatMap((groupId) => [groupId, id])
      );
    });
  }
  if (
    Object.prototype.hasOwnProperty.call(campaign, "texters") &&
    campaign.texters
  ) {
    const { assignmentInputs, ignoreAfterDate } = campaign.texters;
    await addAssignTexters({
      campaignId: id,
      assignmentInputs,
      ignoreAfterDate
    });
  }

  if (
    Object.prototype.hasOwnProperty.call(campaign, "campaignVariables") &&
    campaign.campaignVariables
  ) {
    const cleanedPayload = campaign.campaignVariables
      .map(({ displayOrder, name, value }) => ({
        display_order: displayOrder,
        name: name.trim(),
        value: value?.trim() ? value?.trim() : null
      }))
      .filter(({ name }) => !!name);

    if (
      cleanedPayload.findIndex(({ name }) =>
        allScriptFields([]).includes(name)
      ) >= 0
    ) {
      throw new Error(
        "Required CSV field names cannot be used for variable names!"
      );
    }

    const payload = JSON.stringify(cleanedPayload);

    await r.knex.transaction(async (trx) => {
      await trx.raw(
        `
          with payload as (
            select * from json_populate_recordset(null::campaign_variable, ?::json)
          )
          update campaign_variable
          set deleted_at = now()
          from payload
          where
            campaign_variable.campaign_id = ?
            and payload.name = campaign_variable.name
            and payload.value is distinct from campaign_variable.value
          returning *
        `,
        [payload, id]
      );

      await trx.raw(
        `
          with payload as (
            select * from json_populate_recordset(null::campaign_variable, ?::json)
          ),
          new_variable_ids as (
            insert into campaign_variable (campaign_id, display_order, name, value)
            select ?, display_order, name, value
            from payload
            on conflict (campaign_id, name) where deleted_at is null
              do update set
                display_order = EXCLUDED.display_order,
                value = EXCLUDED.value
            returning id
          ),
          deleted_ids as (
            update campaign_variable
            set deleted_at = now()
            where
              campaign_variable.campaign_id = ?
              and id not in ( select id from new_variable_ids )
              and deleted_at is null
            returning id
          )
          select count(*) from deleted_ids
        `,
        [payload, id, id]
      );
    });
  }

  if (Object.prototype.hasOwnProperty.call(campaign, "interactionSteps")) {
    await unstartIfNecessary();

    // TODO: debug why { script: '' } is even being sent from the client in the first place
    if (!isEqual(campaign.interactionSteps, { scriptOptions: [""] })) {
      await accessRequired(
        user,
        organizationId,
        "SUPERVOLUNTEER",
        /* superadmin */ true
      );
      await persistInteractionStepTree(
        id,
        campaign.interactionSteps ?? [],
        origCampaignRecord
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(campaign, "cannedResponses")) {
    await unstartIfNecessary();

    // Ignore the mocked `id` automatically created on the input by GraphQL
    const convertedResponses = campaign.cannedResponses.map(
      ({
        id: _cannedResponseId,
        displayOrder,
        ...response
      }: { id: number } | any) => ({
        ...response,
        display_order: displayOrder,
        campaign_id: id
      })
    );

    await r.knex.transaction(async (trx) => {
      await trx("canned_response")
        .where({ campaign_id: id })
        .whereNull("user_id")
        .del();
      await trx("canned_response").insert(convertedResponses);
    });

    await cacheableData.cannedResponse.clearQuery({
      userId: "",
      campaignId: id
    });
  }

  const [newCampaign] = await r
    .knex("all_campaign")
    .update(campaignUpdates)
    .where({ id })
    .returning("*");
  cacheableData.campaign.reload(id);

  const memoizer = await MemoizeHelper.getMemoizer();
  await memoizer.invalidate(cacheOpts.CampaignsList.key, {
    organizationId: newCampaign.organization_id
  });

  return newCampaign || loaders.campaign.load(id);
};

export const invalidScriptFields = async (campaignId: string) => {
  const { rows: variables } = await r.knex.raw(
    // eslint-disable-next-line no-useless-escape
    `SELECT DISTINCT regexp_matches(array_to_string(script_options, ','), '\{([^\{]*)\}', 'g') as variable
FROM interaction_step
WHERE campaign_id = ?`,
    [campaignId]
  );

  const parsedVariables = variables
    .map((v: { variable: string }) => v.variable)
    .flat();

  const campaignContact = await r
    .knex("campaign_contact")
    .where({ campaign_id: campaignId })
    .first(["custom_fields"]);

  const customFields = campaignContact
    ? Object.keys(JSON.parse(campaignContact.custom_fields))
    : [];
  const campaignVariables = await r
    .knex("campaign_variable")
    .where({ campaign_id: campaignId })
    .whereNull("deleted_at")
    .pluck("name");
  const validFields = allScriptFields(customFields).concat(campaignVariables);

  const invalidFields = parsedVariables.filter(
    (variable: string) => !validFields.includes(variable)
  );

  return invalidFields;
};

export const unqueueAutosending = async (campaign: CampaignRecord) => {
  if (campaign.autosend_status === "sending") {
    await r.knex.raw(
      `
        select count(*)
        from (
          select graphile_worker.remove_job(key)
          from graphile_worker.jobs
          where task_identifier = 'retry-interaction-step'
            and payload->>'campaignId' = ?
        ) deleted_jobs
      `,
      [campaign.id]
    );
  }

  return campaign;
};

export const markAutosendingPaused = async (campaign: CampaignRecord) => {
  if (campaign.autosend_status === "sending") {
    const [updatedCampaignResult] = await r
      .knex("campaign")
      .update({ autosend_status: "paused" })
      .where({ id: campaign.id })
      .returning("*");

    return updatedCampaignResult;
  }

  return campaign;
};

export const deleteCampaign = async (campaignId: string) => {
  const campaign = await r
    .reader("all_campaign")
    .where({ id: campaignId })
    .first();

  if (campaign.is_template) {
    // In reverse order of copy campaign
    await r
      .knex("campaign_variable")
      .where({ campaign_id: campaignId })
      .delete();

    await r.knex("campaign_team").where({ campaign_id: campaignId }).delete();

    await r.knex("canned_response").where({ campaign_id: campaignId }).delete();

    await r
      .knex("interaction_step")
      .where({ campaign_id: campaignId })
      .delete();

    await r.knex("all_campaign").where({ id: campaignId }).delete();
  }
};
