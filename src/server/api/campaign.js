import isNil from "lodash/isNil";

import { ExternalSyncReadinessState } from "../../api/campaign";
import { UserRoleType } from "../../api/organization-membership";
import { emptyRelayPage } from "../../api/pagination";
import { config } from "../../config";
import { parseIanaZone } from "../../lib/datetime";
import MemoizeHelper, { Buckets, cacheOpts } from "../memoredis";
import { cacheableData, r } from "../models";
import { currentEditors } from "../models/cacheable_queries";
import { accessRequired } from "./errors";
import { getDeliverabilityStats, invalidScriptFields } from "./lib/campaign";
import { symmetricEncrypt } from "./lib/crypto";
import { getMessagingServiceById } from "./lib/message-sending";
import { formatPage } from "./lib/pagination";
import { sqlResolvers } from "./lib/utils";
import { getOrgFeature } from "./organization-settings";
import { getUsers } from "./user";

export function addCampaignsFilterToQuery(queryParam, campaignsFilter) {
  let query = queryParam;

  if (campaignsFilter) {
    const resultSize = campaignsFilter.listSize ? campaignsFilter.listSize : 0;
    const pageSize = campaignsFilter.pageSize ? campaignsFilter.pageSize : 0;

    if ("isArchived" in campaignsFilter) {
      query = query.where("campaign.is_archived", campaignsFilter.isArchived);
    }

    if ("isStarted" in campaignsFilter) {
      query = query.where("campaign.is_started", campaignsFilter.isStarted);
    }

    if ("campaignId" in campaignsFilter) {
      query = query.where(
        "campaign.id",
        parseInt(campaignsFilter.campaignId, 10)
      );
    }

    if ("campaignTitle" in campaignsFilter) {
      query = query.whereRaw(`concat("id", ': ', "title") ilike ?`, [
        `%${campaignsFilter.campaignTitle}%`
      ]);
    }

    if (resultSize && !pageSize) {
      query = query.limit(resultSize);
    }
    if (resultSize && pageSize) {
      query = query.limit(resultSize).offSet(pageSize);
    }
  }
  return query;
}

export function buildCampaignQuery(
  queryParam,
  organizationId,
  campaignsFilter,
  addFromClause = true
) {
  let query = queryParam;

  if (addFromClause) {
    query = query.from("campaign");
  }

  query = query.where("campaign.organization_id", organizationId);
  query = addCampaignsFilterToQuery(query, campaignsFilter);

  return query;
}

const doGetCampaigns = async ({ organizationId, cursor, campaignsFilter }) => {
  let campaignsQuery = buildCampaignQuery(
    r.reader.select("*"),
    organizationId,
    campaignsFilter
  );
  campaignsQuery = campaignsQuery.orderBy("id", "asc");

  if (cursor) {
    // A limit of 0 means a page size of 'All'
    if (cursor.limit !== 0) {
      campaignsQuery = campaignsQuery.limit(cursor.limit).offset(cursor.offset);
    }
    const campaigns = await campaignsQuery;

    const campaignsCountQuery = buildCampaignQuery(
      r.knex.count("*"),
      organizationId,
      campaignsFilter
    );

    const campaignsCount = await r.parseCount(campaignsCountQuery);

    const pageInfo = {
      limit: cursor.limit,
      offset: cursor.offset,
      total: campaignsCount
    };
    return {
      campaigns,
      pageInfo
    };
  }
  return campaignsQuery;
};

export async function getCampaigns(organizationId, cursor, campaignsFilter) {
  const memoizer = await MemoizeHelper.getMemoizer();
  const memoizedCampaigns = MemoizeHelper.hasBucketConfigured(Buckets.Advanced)
    ? memoizer.memoize(doGetCampaigns, cacheOpts.CampaignsList)
    : doGetCampaigns;
  return memoizedCampaigns({ organizationId, cursor, campaignsFilter });
}

const getCampaignOrganization = async ({ campaignId }) => {
  const campaign = await r
    .reader("all_campaign")
    .where({ id: campaignId })
    .first("organization_id");
  return campaign.organization_id;
};

export const resolvers = {
  JobRequest: {
    ...sqlResolvers([
      "id",
      "assigned",
      "status",
      "jobType",
      "resultMessage",
      "createdAt",
      "updatedAt"
    ])
  },
  CampaignStats: {
    sentMessagesCount: async (campaign) => {
      const getSentMessagesCount = async ({ campaignId }) => {
        return r.parseCount(
          r
            .reader("campaign_contact")
            .join(
              "message",
              "message.campaign_contact_id",
              "campaign_contact.id"
            )
            .where({
              "campaign_contact.campaign_id": campaignId,
              "message.is_from_contact": false
            })
            .count()
        );
      };

      const memoizer = await MemoizeHelper.getMemoizer();
      const memoizedSentMessagesCount = MemoizeHelper.hasBucketConfigured(
        Buckets.Aggregates
      )
        ? memoizer.memoize(
            getSentMessagesCount,
            cacheOpts.CampaignSentMessagesCount
          )
        : getSentMessagesCount;

      return memoizedSentMessagesCount({ campaignId: campaign.id });
    },
    receivedMessagesCount: async (campaign) => {
      const getReceivedMessagesCount = async ({ campaignId }) => {
        return r.parseCount(
          r
            .reader("campaign_contact")
            .join(
              "message",
              "message.campaign_contact_id",
              "campaign_contact.id"
            )
            .where({
              "campaign_contact.campaign_id": campaignId,
              "message.is_from_contact": true
            })
            .count()
        );
      };

      const memoizer = await MemoizeHelper.getMemoizer();
      const memoizedReceivedMessagesCount = MemoizeHelper.hasBucketConfigured(
        Buckets.Aggregates
      )
        ? memoizer.memoize(
            getReceivedMessagesCount,
            cacheOpts.CampaignReceivedMessagesCount
          )
        : getReceivedMessagesCount;

      return memoizedReceivedMessagesCount({ campaignId: campaign.id });
    },
    optOutsCount: async (campaign) => {
      const getOptOutsCount = async ({ campaignId, archived }) => {
        return r.getCount(
          r
            .reader("campaign_contact")
            .where({
              is_opted_out: true,
              campaign_id: campaignId
            })
            .whereRaw(`archived = ${archived}`) // partial index friendly
        );
      };

      const memoizer = await MemoizeHelper.getMemoizer();
      const memoizedOptOutsCount = MemoizeHelper.hasBucketConfigured(
        Buckets.Aggregates
      )
        ? memoizer.memoize(getOptOutsCount, cacheOpts.CampaignOptOutsCount)
        : getOptOutsCount;

      return memoizedOptOutsCount({
        campaignId: campaign.id,
        archived: campaign.is_archived
      });
    },

    needsMessageOptOutsCount: async (campaign) => {
      const getNeedsMessageOptOutsCount = async ({ campaignId, archived }) => {
        return r.getCount(
          r
            .reader("campaign_contact")
            .where({
              is_opted_out: true,
              campaign_id: campaignId,
              message_status: "needsMessage"
            })
            .whereRaw(`archived = ${archived}`) // partial index friendly
        );
      };

      const memoizer = await MemoizeHelper.getMemoizer();
      const memoizedNeedsMessageOptOutsCount = MemoizeHelper.hasBucketConfigured(
        Buckets.Aggregates
      )
        ? memoizer.memoize(
            getNeedsMessageOptOutsCount,
            cacheOpts.CampaignNeedsMessageOptOutsCount
          )
        : getNeedsMessageOptOutsCount;

      return memoizedNeedsMessageOptOutsCount({
        campaignId: campaign.id,
        archived: campaign.is_archived
      });
    },

    countMessagedContacts: async (campaign) => {
      const getCountMessagedContacts = async ({ campaignId, archived }) => {
        const { rows } = await r.reader.raw(
          `
              select count(*) as count_messaged_contacts
              from campaign_contact
              where message_status <> 'needsMessage'
                and archived = ${archived}
                and campaign_id = ?
            `,
          [campaignId]
        );

        const [{ count_messaged_contacts: result }] = rows;
        return result;
      };

      const memoizer = await MemoizeHelper.getMemoizer();
      const memoizedCountMessagedContacts = MemoizeHelper.hasBucketConfigured(
        Buckets.Aggregates
      )
        ? memoizer.memoize(
            getCountMessagedContacts,
            cacheOpts.CampaignCountMessagedContacts
          )
        : getCountMessagedContacts;

      return memoizedCountMessagedContacts({
        campaignId: campaign.id,
        archived: campaign.is_archived
      });
    },

    countNeedsMessageContacts: async (campaign) => {
      const getCountNeedsMessageContacts = async ({ campaignId, archived }) => {
        const { rows } = await r.reader.raw(
          `
              select count(*) as count_needs_message_contacts
              from campaign_contact
              where true
                and message_status = 'needsMessage'
                and is_opted_out = false
                and archived = ${archived}
                and campaign_id = ?
            `,
          [campaignId]
        );

        const [{ count_needs_message_contacts: result }] = rows;
        return result;
      };

      const memoizer = await MemoizeHelper.getMemoizer();
      const memoizedCountNeedsMessageContacts = MemoizeHelper.hasBucketConfigured(
        Buckets.Aggregates
      )
        ? memoizer.memoize(
            getCountNeedsMessageContacts,
            cacheOpts.CampaignCountNeedsMessageContacts
          )
        : getCountNeedsMessageContacts;

      return memoizedCountNeedsMessageContacts({
        campaignId: campaign.id,
        archived: campaign.is_archived
      });
    },

    percentUnhandledReplies: async (campaign) => {
      const getPercentUnhandledReplies = async ({ campaignId, archived }) => {
        const {
          rows: [{ percent_unhandled_replies: result }]
        } = await r.reader.raw(
          `
              with contact_counts as (
                select
                  count(*) filter (where message_status = 'needsResponse') as needs_response_count,
                  count(*) filter (where message_status not in ('needsMessage', 'messaged'))::float as engaged_count
                from campaign_contact cc
                where cc.archived = ${archived}
                  and cc.campaign_id = ?
              )
              select
                coalesce(
                  ( needs_response_count /  nullif(engaged_count, 0) ) * 100,
                  0
                ) as percent_unhandled_replies
              from contact_counts
            `,
          [campaignId]
        );

        return result;
      };

      const memoizer = await MemoizeHelper.getMemoizer();
      const memoizedPercentUnhandledReplies = MemoizeHelper.hasBucketConfigured(
        Buckets.Aggregates
      )
        ? memoizer.memoize(
            getPercentUnhandledReplies,
            cacheOpts.CampaignPercentUnhandledReplies
          )
        : getPercentUnhandledReplies;

      return memoizedPercentUnhandledReplies({
        campaignId: campaign.id,
        archived: campaign.is_archived
      });
    }
  },
  CampaignReadiness: {
    id: ({ id }) => id,
    basics: (campaign) => campaign.title !== "" && campaign.description !== "",
    messagingService: async (campaign) => {
      if (campaign.messaging_service_sid === null) {
        return false;
      }

      const messagingService = await r
        .reader("messaging_service")
        .where({ messaging_service_sid: campaign.messaging_service_sid })
        .first();

      return messagingService.active;
    },
    textingHours: (campaign) =>
      campaign.textingHoursStart !== null &&
      campaign.textingHoursEnd !== null &&
      campaign.timezone !== null,
    integration: () => true,
    contacts: (campaign) =>
      r
        .reader("campaign_contact")
        .select("campaign_contact.id")
        .where({ campaign_id: campaign.id })
        .limit(1)
        .then((records) => records.length > 0),
    autoassign: () => true,
    cannedResponses: () => true,
    texters: () => true,
    interactions: async (campaign) => {
      const hasSteps = await r
        .reader("interaction_step")
        .where({ campaign_id: campaign.id })
        .count()
        .then(([{ count }]) => parseInt(count, 10) > 0);

      const hasIncompleteSteps = await r.reader
        .raw(
          `
            with incomplete_variables as (
              select concat('{', name, '}') as name
              from campaign_variable
              where
                campaign_id = ?
                and value is null
                and deleted_at is null
            ),
            interactions as (
              select unnest(script_options) as script_option
              from interaction_step
              where
                campaign_id = ?
                and is_deleted = false
            )
            select exists (
              select 1
              from interactions
              cross join incomplete_variables
              where interactions.script_option like concat('%', incomplete_variables.name, '%')
            ) as uses_incomplete_step
          `,
          [campaign.id, campaign.id]
        )
        .then(({ rows: [{ uses_incomplete_step }] }) => uses_incomplete_step);

      const invalidFields = await invalidScriptFields(campaign.id);

      return hasSteps && !hasIncompleteSteps && invalidFields.length === 0;
    },
    campaignGroups: () => true,
    campaignVariables: (campaign) =>
      r
        .reader("campaign_variable")
        .where({ campaign_id: campaign.id })
        .whereNull("value")
        .whereNull("deleted_at")
        .count()
        .then(([{ count }]) => parseInt(count, 10) === 0)
  },
  CampaignsReturn: {
    __resolveType(obj, _context, _) {
      if (Array.isArray(obj)) {
        return "CampaignsList";
      }
      if ("campaigns" in obj && "pageInfo" in obj) {
        return "PaginatedCampaigns";
      }
      return null;
    }
  },
  CampaignsList: {
    campaigns: (campaigns) => {
      return campaigns;
    }
  },
  PaginatedCampaigns: {
    campaigns: (queryResult) => {
      return queryResult.campaigns;
    },
    pageInfo: (queryResult) => {
      if ("pageInfo" in queryResult) {
        return queryResult.pageInfo;
      }
      return null;
    }
  },
  Campaign: {
    ...sqlResolvers([
      "id",
      "title",
      "description",
      "isStarted",
      "isArchived",
      // TODO: re-enable once dynamic assignment is fixed (#548)
      // "useDynamicAssignment",
      "introHtml",
      "primaryColor",
      "logoImageUrl",
      "textingHoursStart",
      "textingHoursEnd",
      "isAutoassignEnabled",
      "createdAt",
      "landlinesFiltered",
      "messagingServiceSid",
      "autosendLimit",
      "columnMapping"
    ]),
    isApproved: (campaign) =>
      isNil(campaign.is_approved) ? false : campaign.is_approved,
    isTemplate: (campaign) =>
      isNil(campaign.is_template) ? false : campaign.is_template,
    timezone: (campaign) => parseIanaZone(campaign.timezone),
    readiness: (campaign) => campaign,
    repliesStaleAfter: (campaign) => campaign.replies_stale_after_minutes,
    useDynamicAssignment: (_) => false,
    isAssignmentLimitedToTeams: (campaign) =>
      campaign.limit_assignment_to_teams,
    dueBy: (campaign) =>
      campaign.due_by instanceof Date || !campaign.due_by
        ? campaign.due_by || null
        : new Date(campaign.due_by),
    organization: async (campaign, _, { loaders }) =>
      campaign.organization ||
      loaders.organization.load(campaign.organization_id),
    datawarehouseAvailable: (campaign, _, { user }) =>
      user.is_superadmin && config.WAREHOUSE_DB_TYPE !== undefined,
    pendingJobs: async (campaign, { jobTypes = [] }) => {
      const query = r
        .reader("job_request")
        .where({ campaign_id: campaign.id })
        .orderBy("updated_at", "desc");
      if (jobTypes.length > 0) {
        query.whereIn("job_type", jobTypes);
      }
      return query;
    },
    teams: async (campaign) => {
      const getCampaignTeams = async ({ campaignId }) => {
        return r
          .reader("team")
          .select("team.*")
          .join("campaign_team", "campaign_team.team_id", "=", "team.id")
          .where({
            "campaign_team.campaign_id": campaignId
          });
      };

      return getCampaignTeams({ campaignId: campaign.id });
    },
    texters: async (campaign) =>
      getUsers(campaign.organization_id, null, { campaignId: campaign.id }),
    assignments: async (campaign, { assignmentsFilter = {} }) => {
      // TODO: permissions check needed
      let query = r.reader("assignment").where({ campaign_id: campaign.id });

      if (assignmentsFilter.texterId) {
        query = query.where({ user_id: assignmentsFilter.texterId });
      }

      return query;
    },
    interactionSteps: async (campaign) => {
      if (campaign.interactionSteps) {
        return campaign.interactionSteps;
      }

      const getInteractionSteps = async ({ campaignId }) => {
        const interactionSteps = await cacheableData.campaign.dbInteractionSteps(
          campaignId
        );
        return interactionSteps;
      };

      return getInteractionSteps({ campaignId: campaign.id });
    },
    invalidScriptFields: async (campaign) => invalidScriptFields(campaign.id),
    cannedResponses: async (campaign, { userId: userIdArg }) => {
      const getCannedResponses = ({ campaignId, userId }) =>
        cacheableData.cannedResponse.query({ campaignId, userId });

      return getCannedResponses({ campaignId: campaign.id, userId: userIdArg });
    },
    contacts: async (campaign) =>
      r
        .reader("campaign_contact")
        .where({ campaign_id: campaign.id })
        .whereRaw(`archived = ${campaign.is_archived}`), // partial index friendly
    contactsCount: async (campaign) =>
      r.getCount(
        r
          .reader("campaign_contact")
          .where({ campaign_id: campaign.id })
          .whereRaw(`archived = ${campaign.is_archived}`) // partial index friendly
      ),
    hasUnassignedContacts: async (campaign) => {
      if (config.BAD_BENS_DISABLE_HAS_UNASSIGNED_CONTACTS) {
        return false;
      }

      if (
        config.HIDE_CAMPAIGN_STATE_VARS_ON_ARCHIVED_CAMPAIGNS &&
        campaign.is_archived
      ) {
        return false;
      }

      const getHasUnassignedContacts = async ({ campaignId, archived }) => {
        // SQL injection for archived = to enable use of partial index
        const { rows } = await r.reader.raw(
          `
            select exists (
              select 1
              from campaign_contact
              where
                campaign_id = ?
                and assignment_id is null
                and archived = ${archived}
                and not exists (
                  select 1
                  from campaign_contact_tag
                  join tag on campaign_contact_tag.tag_id = tag.id
                  where tag.is_assignable = false
                    and campaign_contact_tag.campaign_contact_id = campaign_contact.id
                )
                and is_opted_out = false
            ) as contact_exists
          `,
          [campaignId]
        );

        return rows[0] && rows[0].contact_exists;
      };

      return getHasUnassignedContacts({
        campaignId: campaign.id,
        archived: campaign.is_archived
      });
    },
    hasUnsentInitialMessages: async (campaign) => {
      if (
        config.HIDE_CAMPAIGN_STATE_VARS_ON_ARCHIVED_CAMPAIGNS &&
        campaign.is_archived
      ) {
        return false;
      }

      const getHasUnsentInitialMessages = async ({ campaignId, archived }) => {
        const contacts = await r
          .reader("campaign_contact")
          .select("id")
          .where({
            campaign_id: campaignId,
            message_status: "needsMessage",
            is_opted_out: false
          })
          .whereRaw(`archived = ${archived}`) // partial index friendly
          .limit(1);
        return contacts.length > 0;
      };

      return getHasUnsentInitialMessages({
        campaignId: campaign.id,
        archived: campaign.is_archived
      });
    },
    hasUnhandledMessages: async (campaign) => {
      if (
        config.HIDE_CAMPAIGN_STATE_VARS_ON_ARCHIVED_CAMPAIGNS &&
        campaign.is_archived
      ) {
        return false;
      }

      const getHasUnhandledMessages = async ({
        campaignId,
        archived,
        organizationId
      }) => {
        let contactsQuery = r
          .reader("campaign_contact")
          .pluck("campaign_contact.id")
          .where({
            "campaign_contact.campaign_id": campaignId,
            message_status: "needsResponse",
            is_opted_out: false
          })
          .whereRaw(`archived = ${archived}`) // partial index friendly
          .limit(1);

        const notAssignableTagSubQuery = r.reader
          .select("campaign_contact_tag.campaign_contact_id")
          .from("campaign_contact_tag")
          .join("tag", "tag.id", "=", "campaign_contact_tag.tag_id")
          .where({
            "tag.organization_id": organizationId
          })
          .whereRaw("lower(tag.title) = 'escalated'")
          .whereRaw(
            "campaign_contact_tag.campaign_contact_id = campaign_contact.id"
          );

        contactsQuery = contactsQuery.whereNotExists(notAssignableTagSubQuery);

        const contacts = await contactsQuery;
        return contacts.length > 0;
      };

      return getHasUnhandledMessages({
        campaignId: campaign.id,
        archived: campaign.is_archived,
        organizationId: campaign.organization_id
      });
    },
    customFields: async (campaign) =>
      campaign.customFields ||
      cacheableData.campaign.dbCustomFields(campaign.id),
    stats: async (campaign) => campaign,
    editors: async (campaign, _, { user }) => {
      if (r.redis) {
        return currentEditors(r.redis, campaign, user);
      }
      return "";
    },
    creator: async (campaign, _, { loaders }) =>
      campaign.creator_id ? loaders.user.load(campaign.creator_id) : null,
    previewUrl: async (campaign, _, { user, loaders }) => {
      const campaignId = campaign.id;
      const organizationId = await getCampaignOrganization({ campaignId });
      const { features } = await loaders.organization.load(organizationId);
      const supervolAccess = getOrgFeature(
        "scriptPreviewForSupervolunteers",
        features
      );
      const requiredRole = supervolAccess
        ? UserRoleType.SUPERVOLUNTEER
        : UserRoleType.ADMIN;
      try {
        await accessRequired(user, organizationId, requiredRole);
      } catch {
        // Return null because Message Review uses loadData() HOC which does not tolerate errors
        return null;
      }
      const token = symmetricEncrypt(`${campaign.id}`);
      return token;
    },
    externalSystem: async (campaign) =>
      campaign.external_system_id
        ? r
            .reader("external_system")
            .where({ id: campaign.external_system_id })
            .first()
        : null,
    syncReadiness: async (campaign) => {
      if (!campaign.external_system_id)
        return ExternalSyncReadinessState.MISSING_SYSTEM;

      const {
        rows: [{ missing_and_required, includes_not_active }]
      } = await r.reader.raw(
        `
          select
            count(*) filter (where is_missing and is_required) as missing_and_required,
            count(*) filter (where includes_not_active) as includes_not_active
          from public.external_sync_question_response_configuration
          where
            campaign_id = ?
            and system_id = ?
        `,
        [campaign.id, campaign.external_system_id]
      );

      return missing_and_required > 0
        ? ExternalSyncReadinessState.MISSING_REQUIRED_MAPPING
        : includes_not_active > 0
        ? ExternalSyncReadinessState.INCLUDES_NOT_ACTIVE_TARGETS
        : ExternalSyncReadinessState.READY;
    },
    externalSyncConfigurations: async (campaign, { after, first }) => {
      if (!campaign.external_system_id) return emptyRelayPage();

      const query = r
        .reader("external_sync_question_response_configuration")
        .where({
          campaign_id: campaign.id,
          system_id: campaign.external_system_id
        });
      return formatPage(query, { after, first, primaryColumn: "compound_id" });
    },
    deliverabilityStats: async (campaign, { filter }) => {
      // Wrapper to manage memoizer arg format
      const doGetDeliverabilityStats = async (opts) => {
        const { campaignId, initialMessagesOnly } = opts;
        const deliverabilityStats = await getDeliverabilityStats(campaignId, {
          initialMessagesOnly
        });
        return deliverabilityStats;
      };

      const memoizer = await MemoizeHelper.getMemoizer();
      const memoizedDeliverabilityStats = memoizer.memoize(
        doGetDeliverabilityStats,
        cacheOpts.DeliverabilityStats
      );

      const stats = await memoizedDeliverabilityStats({
        campaignId: parseInt(campaign.id, 10),
        initialMessagesOnly: filter?.initialMessagesOnly
      });

      return stats;
    },
    campaignGroups: async (campaign, { after, first }, { user }) => {
      const organizationId = parseInt(campaign.organization_id, 10);
      await accessRequired(user, organizationId, UserRoleType.ADMIN);

      const query = r
        .reader("campaign_group")
        .select("campaign_group.*")
        .join(
          "campaign_group_campaign",
          "campaign_group_campaign.campaign_group_id",
          "campaign_group.id"
        )
        .where({ campaign_id: campaign.id });
      const result = await formatPage(query, { after, first });
      return result;
    },
    campaignVariables: async (campaign, { after, first }, { user }) => {
      const organizationId = parseInt(campaign.organization_id, 10);
      await accessRequired(user, organizationId, UserRoleType.TEXTER);

      const query = r
        .reader("campaign_variable")
        .where({ campaign_id: campaign.id })
        .whereNull("deleted_at")
        .select("*");
      const result = await formatPage(query, { after, first });
      return result;
    },
    autosendStatus: async (campaign) => {
      const {
        rows: [{ autosend_status }]
      } = await r.reader.raw(
        `
          select case
            when autosend_status = 'sending' and (
              id <> (select min(id) from autosend_campaigns_to_send)
              -- if no campaigns to send exist (ex. after texting hours) the condition above fails
              or not exists (select id from autosend_campaigns_to_send)
            ) then 'holding'
            else autosend_status
          end autosend_status
          from campaign c
          where id = ?
        `,
        [campaign.id]
      );
      return autosend_status;
    },
    messagingService: async (campaign, _, { user }) => {
      const {
        organization_id: orgId,
        messaging_service_sid: msgServiceId
      } = campaign;

      if (!msgServiceId) {
        return null;
      }

      try {
        await accessRequired(user, orgId, UserRoleType.ADMIN, true);
      } catch {
        return null;
      }

      const messagingService = await getMessagingServiceById(msgServiceId);
      return messagingService;
    }
  }
};
