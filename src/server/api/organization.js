import { UserRoleType } from "../../api/organization-membership";
import { config } from "../../config";
import logger from "../../logger";
import { r } from "../models";
import { errToObj } from "../utils";
import {
  allCurrentAssignmentTargets,
  cachedMyCurrentAssignmentTargets,
  myCurrentAssignmentTarget
} from "./assignment";
import { getCampaigns } from "./campaign";
import { accessRequired } from "./errors";
import { infoHasQueryPath } from "./lib/apollo";
import { getCampaigns as getCampaignsRelay } from "./lib/campaign";
import { formatPage } from "./lib/pagination";
import { sqlResolvers } from "./lib/utils";
import { buildUserOrganizationQuery } from "./user";

export const getEscalationUserId = async (organizationId) => {
  let escalationUserId;
  try {
    const organization = await r
      .reader("organization")
      .where({ id: organizationId })
      .first("organization.features");
    const features = JSON.parse(organization.features);
    escalationUserId = parseInt(features.escalationUserId, 10);
  } catch (error) {
    // no-op
  }
  return escalationUserId;
};

export const resolvers = {
  Organization: {
    ...sqlResolvers([
      "id",
      "name",
      "defaultTextingTz",
      "deletedAt",
      "autosendingMps"
    ]),
    settings: (organization) => organization,
    campaigns: async (organization, { cursor, campaignsFilter }, { user }) => {
      await accessRequired(user, organization.id, UserRoleType.SUPERVOLUNTEER);
      return getCampaigns(organization.id, cursor, campaignsFilter);
    },
    campaignsRelay: async (
      organization,
      { first, after, filter },
      { user }
    ) => {
      await accessRequired(user, organization.id, UserRoleType.SUPERVOLUNTEER);
      filter.organizationId = organization.id;
      return getCampaignsRelay({ first, after, filter });
    },
    templateCampaigns: async (organization, { first, after }, { user }) => {
      await accessRequired(user, organization.id, UserRoleType.SUPERVOLUNTEER);
      const query = r
        .reader("all_campaign")
        .where({
          organization_id: organization.id,
          is_template: true
        })
        .select("*");
      const pagerOptions = { first, after };
      return formatPage(query, pagerOptions);
    },
    uuid: async (organization, _, { user }) => {
      await accessRequired(user, organization.id, UserRoleType.SUPERVOLUNTEER);
      const result = await r
        .reader("organization")
        .column("uuid")
        .where("id", organization.id);
      return result[0].uuid;
    },
    optOuts: async (organization, _, { user }) => {
      await accessRequired(user, organization.id, UserRoleType.ADMIN);
      return r.reader("opt_out").where({ organization_id: organization.id });
    },
    memberships: async (
      organization,
      { first, after, filter },
      { user },
      info
    ) => {
      await accessRequired(user, organization.id, UserRoleType.SUPERVOLUNTEER);
      const query = r
        .reader("user_organization")
        .where({ organization_id: organization.id });

      const pagerOptions = {
        first,
        after,
        primaryColumn: "user_organization.id"
      };

      const { nameSearch, campaignId, campaignArchived, roles } = filter || {};

      const userQueryPath = "memberships.edges.node.user";
      const wantsUserInfo = infoHasQueryPath(info, userQueryPath);

      if (roles) {
        query.whereIn("role", roles);
      }

      if (!!nameSearch || wantsUserInfo) {
        query.join("user", "user.id", "user_organization.user_id");
      }
      if (nameSearch) {
        query.whereRaw(
          `"user"."first_name"
          || ' ' ||
          "user"."last_name"
          || ' ' ||
          regexp_replace("user"."email", '@\\w+\\.\\w+', '')
           ilike ?`,
          [`%${nameSearch}%`]
        );
      }
      if (wantsUserInfo) {
        query.select([
          "user_organization.*",
          "user.id as user_table_id",
          "user.email",
          "user.first_name",
          "user.last_name",
          "user.is_suspended"
        ]);
        pagerOptions.nodeTransformer = (record) => {
          const {
            user_table_id,
            email,
            first_name,
            last_name,
            is_suspended,
            ...node
          } = record;
          return {
            ...node,
            user: {
              id: user_table_id,
              email,
              first_name,
              last_name,
              is_suspended
            }
          };
        };
      } else {
        query.select(["user_organization.*"]);
      }

      const campaignIdInt = parseInt(campaignId, 10);
      if (!Number.isNaN(campaignIdInt)) {
        query.whereExists(function subquery() {
          this.select(this.client.raw("1"))
            .from("assignment")
            .whereRaw('"assignment"."user_id" = "user_organization"."user_id"')
            .where({ campaign_id: campaignIdInt });
        });
      } else if (campaignArchived === true || campaignArchived === false) {
        query.whereExists(function subquery() {
          this.select(this.client.raw("1"))
            .from("assignment")
            .join("campaign", "campaign.id", "assignment.campaign_id")
            .whereRaw('"assignment"."user_id" = "user"."id"')
            .where({
              is_archived: campaignArchived
            });
        });
      }

      return formatPage(query, pagerOptions);
    },
    people: async (organization, { role, campaignId, offset }, { user }) => {
      await accessRequired(user, organization.id, UserRoleType.SUPERVOLUNTEER);
      const query = buildUserOrganizationQuery(
        r.knex.select("user.*"),
        organization.id,
        role,
        campaignId,
        offset
      ).orderBy(["first_name", "last_name", "id"]);
      if (typeof offset === "number") {
        return query.limit(200);
      }
      return query;
    },
    peopleCount: async (organization, _, { user }) => {
      await accessRequired(user, organization.id, UserRoleType.SUPERVOLUNTEER);
      return r.getCount(
        r
          .reader("user")
          .join("user_organization", "user.id", "user_organization.user_id")
          .where("user_organization.organization_id", organization.id)
      );
    },
    threeClickEnabled: (organization) =>
      organization.features.indexOf("threeClick") !== -1,
    textingHoursEnforced: (organization) => organization.texting_hours_enforced,
    optOutMessage: (organization) =>
      (organization.features &&
      organization.features.indexOf("opt_out_message") !== -1
        ? JSON.parse(organization.features).opt_out_message
        : config.OPT_OUT_MESSAGE) ||
      "I'm opting you out of texts immediately. Have a great day.",
    textingHoursStart: (organization) => organization.texting_hours_start,
    textingHoursEnd: (organization) => organization.texting_hours_end,
    textRequestFormEnabled: (organization) => {
      try {
        const features = JSON.parse(organization.features);
        return features.textRequestFormEnabled || false;
      } catch (ex) {
        return false;
      }
    },
    textRequestType: (organization) => {
      const defaultValue = "UNSENT";
      try {
        const features = JSON.parse(organization.features);
        return features.textRequestType || defaultValue;
      } catch (ex) {
        return defaultValue;
      }
    },
    textRequestMaxCount: (organization) => {
      try {
        const features = JSON.parse(organization.features);
        return parseInt(features.textRequestMaxCount, 10) || null;
      } catch (ex) {
        return null;
      }
    },
    textsAvailable: async (organization, _, context) => {
      const assignmentTarget = await myCurrentAssignmentTarget(
        context.user.id,
        organization.id
      );
      return !!assignmentTarget;
    },
    currentAssignmentTargets: async (organization, _, { user }) => {
      await accessRequired(user, organization.id, UserRoleType.SUPERVOLUNTEER);
      const cats = await allCurrentAssignmentTargets(organization.id);
      const formatted = cats.map((cat) => ({
        type: cat.assignment_type,
        countLeft: cat.count_left ? parseInt(cat.count_left, 10) : null,
        campaign: {
          id: cat.id,
          title: cat.title
        },
        teamTitle: cat.team_title,
        enabled: cat.enabled
      }));
      return formatted;
    },
    myCurrentAssignmentTarget: async (organization, _, context) => {
      const assignmentTarget = await myCurrentAssignmentTarget(
        context.user.id,
        organization.id
      );

      if (assignmentTarget) {
        const {
          type: assignmentType,
          count_left,
          max_request_count,
          team_title
        } = assignmentTarget;
        return {
          type: assignmentType,
          countLeft: count_left ? parseInt(count_left, 10) : null,
          maxRequestCount: max_request_count
            ? parseInt(max_request_count, 10)
            : null,
          teamTitle: team_title
        };
      }
      return null;
    },
    myCurrentAssignmentTargets: async (organization, _, context) => {
      await accessRequired(
        context.user,
        organization.id,
        UserRoleType.TEXTER,
        /* allowSuperadmin= */ true
      );
      try {
        const assignmentTargets = await cachedMyCurrentAssignmentTargets(
          context.user.id,
          organization.id
        );

        return assignmentTargets.map((at) => ({
          type: at.type,
          countLeft: at.count_left ? parseInt(at.count_left, 10) : null,
          maxRequestCount: at.max_request_count
            ? parseInt(at.max_request_count, 10)
            : null,
          teamTitle: at.team_title,
          teamId: at.team_id
        }));
      } catch (err) {
        logger.error("Error fetching myCurrentAssignmentTargets: ", {
          error: errToObj(err),
          organization,
          context
        });
        throw err;
      }
    },
    escalatedConversationCount: async (organization) => {
      if (config.DISABLE_SIDEBAR_BADGES) return 0;

      const countQuery = r
        .reader("campaign_contact")
        .where({
          archived: false,
          is_opted_out: false,
          message_status: "needsResponse"
        })
        .whereExists(function subquery() {
          this.select("campaign_contact_tag.campaign_contact_id")
            .from("campaign_contact_tag")
            .join("tag", "tag.id", "=", "campaign_contact_tag.tag_id")
            .where({
              "tag.organization_id": organization.id
            })
            .whereRaw("lower(tag.title) = 'escalated'")
            .whereRaw(
              "campaign_contact_tag.campaign_contact_id = campaign_contact.id"
            );
        })
        .count("*");

      const escalatedCount = await r.parseCount(countQuery);
      return escalatedCount;
    },
    numbersApiKey: async (organization) => {
      let numbersApiKey = null;

      try {
        const features = JSON.parse(organization.features);
        numbersApiKey = `${features.numbersApiKey.slice(0, 4)}****************`;
      } catch (ex) {
        // no-op
      }

      return numbersApiKey;
    },
    pendingAssignmentRequestCount: async (organization) =>
      config.DISABLE_SIDEBAR_BADGES
        ? 0
        : r.parseCount(
            r.reader("assignment_request").count("*").where({
              status: "pending",
              organization_id: organization.id
            })
          ),
    linkDomains: async (organization) => {
      const rawResult = await r.reader.raw(
        `
        select
          link_domain.*,
          (is_unhealthy is null or not is_unhealthy) as is_healthy
        from
          link_domain
        left join
          (
            select
              domain,
              (healthy_again_at is null or healthy_again_at > now()) as is_unhealthy
            from
              unhealthy_link_domain
            order by
              created_at desc
            limit 1
          ) unhealthy_domains
          on
            unhealthy_domains.domain = link_domain.domain
        where
          link_domain.organization_id = ?
        order by created_at asc
        ;
      `,
        [organization.id]
      );
      return rawResult.rows;
    },
    unhealthyLinkDomains: async (_) => {
      const rawResult = await r.knex.raw(`
        select
          distinct on (domain) *
        from
          unhealthy_link_domain
        order by
          domain,
          created_at desc
        ;
      `);
      return rawResult.rows;
    },
    tagList: async (organization) => {
      const getTags = async ({ organizationId }) => {
        return r
          .reader("tag")
          .where({ organization_id: organizationId })
          .orderBy(["is_system", "title"]);
      };

      return getTags({ organizationId: organization.id });
    },
    escalationTagList: async (organization) => {
      const getEscalationTags = async ({ organizationId }) => {
        return r
          .reader("tag")
          .where({ organization_id: organizationId, is_assignable: false })
          .orderBy("is_system", "desc")
          .orderBy("title", "asc");
      };

      return getEscalationTags({ organizationId: organization.id });
    },
    teams: async (organization) =>
      r
        .reader("team")
        .where({ organization_id: organization.id })
        .orderBy("assignment_priority", "asc"),
    externalSystems: async (organization, { after, first }, { user }) => {
      const organizationId = parseInt(organization.id, 10);
      await accessRequired(user, organizationId, UserRoleType.ADMIN);

      const query = r
        .reader("external_system")
        .where({ organization_id: organizationId });
      return formatPage(query, { after, first });
    },
    messagingServices: async (
      organization,
      { after, first, active },
      { user }
    ) => {
      const organizationId = parseInt(organization.id, 10);
      try {
        await accessRequired(user, organizationId, UserRoleType.ADMIN, true);
      } catch {
        return null;
      }
      let query = r
        .reader("messaging_service")
        .where({ organization_id: organizationId });

      if (active) {
        query = query.where({ active });
      }

      return formatPage(query, {
        after,
        first,
        primaryColumn: "messaging_service_sid"
      });
    },
    campaignGroups: async (organization, { after, first }, { user }) => {
      const organizationId = parseInt(organization.id, 10);
      await accessRequired(user, organizationId, UserRoleType.ADMIN);

      const query = r
        .reader("campaign_group")
        .where({ organization_id: organizationId });
      const result = await formatPage(query, { after, first });
      return result;
    },
    deletedBy: async (organization) =>
      organization.deleted_by
        ? r.reader("user").where({ id: organization.deleted_by })
        : null
  }
};
