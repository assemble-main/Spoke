import { ForbiddenError } from "apollo-server-errors";
import _ from "lodash";

import { config } from "../../config";
import { VALID_CONTENT_TYPES, withTempDownload } from "../../lib/utils";
import {
  getInstanceNotifications,
  getOrgLevelNotifications
} from "../lib/notices";
import MemoizeHelper, { cacheOpts } from "../memoredis";
import { r } from "../models";
import { getCampaigns } from "./campaign";
import { queryCampaignOverlaps } from "./campaign-overlap";
import { getConversations } from "./conversations";
import { accessRequired, authRequired, superAdminRequired } from "./errors";
import { getStepsToUpdate } from "./lib/bulk-script-editor";
import { getFileType } from "./lib/file-type";
import { formatPage } from "./lib/pagination";
import { getUsers, getUsersById } from "./user";

const rootResolvers = {
  Action: {
    name: (o) => o.name,
    display_name: (o) => o.display_name,
    instructions: (o) => o.instructions
  },
  FoundContact: {
    found: (o) => o.found
  },
  RootQuery: {
    campaign: async (_root, { id }, { loaders, user }) => {
      const campaign = await loaders.campaign.load(id);
      if (!campaign) {
        return null;
      }
      await accessRequired(user, campaign.organization_id, "SUPERVOLUNTEER");
      return campaign;
    },
    assignment: async (_root, { id }, { loaders, user }) => {
      authRequired(user);
      const assignment = await loaders.assignment.load(id);
      const campaign = await loaders.campaign.load(assignment.campaign_id);
      if (assignment.user_id === user.id) {
        await accessRequired(
          user,
          campaign.organization_id,
          "TEXTER",
          /* allowSuperadmin= */ true
        );
      } else {
        await accessRequired(
          user,
          campaign.organization_id,
          "SUPERVOLUNTEER",
          /* allowSuperadmin= */ true
        );
      }
      return assignment;
    },
    organization: async (_root, { id }, { loaders, user }) => {
      await accessRequired(user, id, "TEXTER", /* allowSuperadmin= */ true);

      const memoizer = await MemoizeHelper.getMemoizer();
      const getOrganization = memoizer.memoize(async ({ organizationId }) => {
        return loaders.organization.load(organizationId);
      }, cacheOpts.Organization);

      return getOrganization({ organizationId: id });
    },
    team: async (_root, { id }, { user }) => {
      const team = await r.knex("team").where({ id }).first();
      await accessRequired(user, team.organization_id, "SUPERVOLUNTEER");
      return team;
    },
    // TODO: this return a single element, not a single element array
    inviteByHash: async (_root, { hash }, { user }) => {
      authRequired(user);
      return r.reader("invite").where({ hash });
    },
    currentUser: async (_root, { id: _id }, { user }) => {
      if (!user) {
        return null;
      }
      return user;
    },
    contact: async (_root, { id }, { loaders, user }) => {
      authRequired(user);
      const contact = await loaders.campaignContact.load(id);
      const campaign = await loaders.campaign.load(contact.campaign_id);
      await accessRequired(
        user,
        campaign.organization_id,
        "TEXTER",
        /* allowSuperadmin= */ true
      );
      return contact;
    },
    organizations: async (_root, { active }, { user }) => {
      await superAdminRequired(user);
      const query = r.reader("organization");
      if (active) {
        query.whereNull("deleted_at");
      }
      return query;
    },
    availableActions: (_root, { organizationId }, { user: _user }) => {
      if (!config.ACTION_HANDLERS) {
        return [];
      }
      const allHandlers = config.ACTION_HANDLERS.split(",");

      const availableHandlers = allHandlers
        .map((handler) => {
          return {
            name: handler,
            // eslint-disable-next-line global-require,import/no-dynamic-require
            handler: require(`../action_handlers/${handler}.js`)
          };
        })
        .filter(async (h) => h && h.handler.available(organizationId));

      const availableHandlerObjects = availableHandlers.map((handler) => {
        return {
          name: handler.name,
          display_name: handler.handler.displayName(),
          instructions: handler.handler.instructions()
        };
      });
      return availableHandlerObjects;
    },
    conversations: async (
      _root,
      {
        cursor,
        organizationId,
        campaignsFilter,
        assignmentsFilter,
        tagsFilter,
        contactsFilter,
        contactNameFilter
      },
      { user }
    ) => {
      await accessRequired(user, organizationId, "SUPERVOLUNTEER", true);

      return getConversations(
        cursor,
        organizationId,
        campaignsFilter,
        assignmentsFilter,
        tagsFilter,
        contactsFilter,
        contactNameFilter
      );
    },
    campaigns: async (
      _root,
      { organizationId, cursor, campaignsFilter },
      { user }
    ) => {
      await accessRequired(user, organizationId, "SUPERVOLUNTEER");
      return getCampaigns(organizationId, cursor, campaignsFilter);
    },
    people: async (
      _root,
      { organizationId, cursor, campaignsFilter, role },
      { user }
    ) => {
      if (organizationId) {
        await accessRequired(user, organizationId, "SUPERVOLUNTEER");
      } else if (!user.is_superadmin) {
        throw new ForbiddenError(
          "You are not authorized to access that resource"
        );
      }
      return getUsers(organizationId, cursor, campaignsFilter, role);
    },
    peopleByUserIds: async (_root, { organizationId, userIds }, { user }) => {
      await accessRequired(user, organizationId, "SUPERVOLUNTEER");
      return getUsersById(userIds);
    },
    fetchCampaignOverlaps: async (_root, { input }, { user }) => {
      const { targetCampaignId: campaignId, includeArchived } = input;
      const { organization_id: organizationId } = await r
        .knex("campaign")
        .where({ id: campaignId })
        .first(["organization_id"]);

      await accessRequired(user, organizationId, "ADMIN");

      const { rows } = await queryCampaignOverlaps({
        organizationId,
        campaignId,
        includeArchived
      });

      const toReturn = rows.map(
        ({ campaign_id, count, campaign_title, last_activity }) => ({
          campaign: { id: campaign_id, title: campaign_title },
          overlapCount: count,
          lastActivity: last_activity
        })
      );

      return toReturn;
    },
    assignmentRequests: async (_root, { organizationId, status }, { user }) => {
      await accessRequired(user, organizationId, "SUPERVOLUNTEER");

      const query = r
        .knex("assignment_request")
        .select(
          "assignment_request.*",
          "user.id as user_id",
          "user.first_name",
          "user.last_name"
        )
        .join("user", "user_id", "=", "user.id")
        .where({
          organization_id: organizationId
        });

      if (status) {
        query.where({ status });
      }

      const assignmentRequests = await query;
      const result = assignmentRequests.map((ar) => {
        ar.user = {
          id: ar.user_id,
          first_name: ar.first_name,
          last_name: ar.last_name
        };
        ar.organization = { id: ar.organization_id };
        return ar;
      });
      return result;
    },
    trollAlarms: async (
      _root,
      { limit, offset, token, dismissed, organizationId },
      { user }
    ) => {
      organizationId = parseInt(organizationId, 10);
      await accessRequired(user, organizationId, "SUPERVOLUNTEER");

      let query = r
        .reader("troll_alarm")
        .where({ dismissed, organization_id: organizationId });

      if (token !== null) {
        query = query.where({ trigger_token: token });
      }

      const countQuery = query.clone();
      const [{ count: totalCount }] = await countQuery.count();
      const alarmRows = await query
        .join("message", "message.id", "=", "troll_alarm.message_id")
        .join("user", "user.id", "message.user_id")
        .join(
          "campaign_contact",
          "campaign_contact.id",
          "message.campaign_contact_id"
        )
        .select(
          "message_id",
          "trigger_token as token",
          "dismissed",
          "message.text as message_text",
          "user.id",
          "user.first_name",
          "user.last_name",
          "user.email",
          "campaign_contact.id as cc_id",
          "campaign_contact.campaign_id",
          "campaign_contact.first_name as cc_first_name",
          "campaign_contact.last_name as cc_last_name"
        )
        .orderBy("troll_alarm.message_id", "desc")
        .limit(limit)
        .offset(offset);
      const alarms = alarmRows.map(
        ({
          message_id,
          token: alarmToken,
          dismissed: alarmDismissed,
          message_text,
          cc_id,
          campaign_id,
          cc_first_name,
          cc_last_name,
          ...alarmUser
        }) => ({
          message_id,
          token: alarmToken,
          dismissed: alarmDismissed,
          message_text,
          user: alarmUser,
          contact: {
            id: cc_id,
            campaign_id,
            first_name: cc_first_name,
            last_name: cc_last_name
          }
        })
      );

      return { alarms, totalCount };
    },
    trollAlarmsCount: async (
      _root,
      { dismissed, organizationId },
      { user }
    ) => {
      organizationId = parseInt(organizationId, 10);
      await accessRequired(user, organizationId, "SUPERVOLUNTEER");

      const query = r
        .reader("troll_alarm")
        .where({ dismissed, organization_id: organizationId });

      const [{ count: totalCount }] = await query.count();

      return { totalCount };
    },
    trollTokens: async (_root, { organizationId }, { user }) => {
      await accessRequired(user, organizationId, "SUPERVOLUNTEER");

      const tokens = await r
        .reader("troll_trigger")
        .where({ organization_id: parseInt(organizationId, 10) });

      return tokens.map((t) => ({
        id: t.token,
        token: t.token,
        mode: t.mode.toUpperCase(),
        compiledTsQuery: t.compiled_tsquery,
        organizationId
      }));
    },
    externalSystem: async (_root, { systemId }, { user }) => {
      const system = await r
        .reader("external_system")
        .where({ id: systemId })
        .first();

      await accessRequired(user, system.organization_id, "ADMIN");

      return system;
    },
    externalSystems: async (
      _root,
      { organizationId, after, first },
      { user }
    ) => {
      await accessRequired(user, organizationId, "ADMIN");

      const query = r
        .reader("external_system")
        .where({ organization_id: parseInt(organizationId, 10) });
      return formatPage(query, { after, first });
    },
    externalLists: async (
      _root,
      { organizationId, systemId, after, first },
      { user }
    ) => {
      await accessRequired(user, organizationId, "ADMIN");

      const query = r.reader("external_list").where({
        organization_id: parseInt(organizationId, 10),
        system_id: systemId
      });
      return formatPage(query, { after, first });
    },
    notices: async (_root, { organizationId }, { user }) => {
      let notices = [];
      if (!user) return notices;

      if (user && user.is_superadmin) {
        const instanceNotifications = await getInstanceNotifications(user.id);
        notices = notices.concat(instanceNotifications);
      }

      const orgNotices = await getOrgLevelNotifications(
        user.id,
        organizationId ?? undefined
      );
      notices = notices.concat(orgNotices);

      const pageInfo = {
        totalCount: notices.length,
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: notices[0]?.id ?? null,
        endCursor: notices[notices.length - 1]?.id ?? null
      };

      const edges = notices.map((notice) => ({
        cursor: notice.id,
        node: notice
      }));

      return { pageInfo, edges };
    },
    campaignGroups: async (
      _root,
      { organizationId, after, first },
      { user }
    ) => {
      await accessRequired(user, organizationId, "ADMIN");

      const query = r.reader("campaign_group").where({
        organization_id: parseInt(organizationId, 10)
      });
      return formatPage(query, { after, first });
    },
    campaignNavigation: async (_root, { campaignId }, { user }) => {
      const { organization_id: organizationId } = await r
        .knex("campaign")
        .where({ id: campaignId })
        .first("organization_id");

      await accessRequired(user, organizationId, "SUPERVOLUNTEER");

      const { prev_campaign: prevCampaignId } = await r
        .knex("campaign")
        .max({ prev_campaign: "id" })
        .where("id", "<", campaignId)
        .where({ organization_id: organizationId })
        .first();

      const { next_campaign: nextCampaignId } = await r
        .knex("campaign")
        .min({ next_campaign: "id" })
        .where("id", ">", campaignId)
        .where({ organization_id: organizationId })
        .first();

      return {
        prevCampaignId,
        nextCampaignId
      };
    },
    bulkUpdateScriptChanges: async (
      _root,
      { organizationId, findAndReplace },
      { user }
    ) => {
      await accessRequired(user, organizationId, "OWNER");

      const steps = await r.knex.transaction((trx) => {
        return getStepsToUpdate(trx, findAndReplace);
      });

      const { searchString } = findAndReplace;

      const stepsToChange = steps.flatMap((step) => {
        const scriptOptions = step.script_options.filter((option) =>
          option.includes(searchString)
        );

        // IDs get index added to it to not have multiple of the same IDs
        // causes an issue with GraphQL if IDs are the same
        return scriptOptions.map((scriptOption, index) => ({
          id: `${step.id}-${index}`,
          campaignId: step.campaign_id,
          campaignName: step.title,
          script: scriptOption
        }));
      });

      return stepsToChange;
    },
    superadmins: async (_root, _options, { user }) => {
      if (user.is_superadmin) {
        return r.reader("user").where({ is_superadmin: true });
      }
      throw new ForbiddenError(
        "You are not authorized to access that resource"
      );
    },
    optOuts: async (_root, { organizationId }, { user }) => {
      await accessRequired(user, organizationId, "ADMIN");

      const query = r
        .knex("opt_out")
        .leftJoin("assignment", "assignment.id", "assignment_id")
        .leftJoin("campaign", "campaign.id", "assignment.campaign_id")
        .leftJoin("organization", "organization.id", "opt_out.organization_id")
        .groupBy("campaign.id", "campaign.title", "organization.name")
        .select(
          "campaign.id as campaignId",
          "campaign.title as campaignTitle",
          "organization.name as orgName"
        )
        .count("*");

      if (!config.OPTOUTS_SHARE_ALL_ORGS) {
        query.where({ "opt_out.organization_id": organizationId });
      }

      const results = await query;

      return results.map((result) => {
        let title;
        let campaignId;

        if (result.campaignId) {
          campaignId = result.campaignId;
          title = config.OPTOUTS_SHARE_ALL_ORGS
            ? `${result.orgName} : ${result.campaignTitle}`
            : result.campaignTitle;
        } else {
          campaignId = "-1";
          title = config.OPTOUTS_SHARE_ALL_ORGS
            ? `${result.orgName} : Manually Uploaded`
            : "Manually Uploaded";
        }

        return {
          title,
          id: campaignId,
          count: result.count
        };
      });
    },
    isValidAttachment: async (_root, { fileUrl }, _context) => {
      const handler = async (filePath) => {
        const fileType = await getFileType(filePath);

        return VALID_CONTENT_TYPES.includes(fileType);
      };
      return withTempDownload(fileUrl, handler);
    }
  }
};

export default rootResolvers;
