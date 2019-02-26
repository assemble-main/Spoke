import camelCaseKeys from "camelcase-keys";
import GraphQLDate from "graphql-date";
import GraphQLJSON from "graphql-type-json";
import { GraphQLError } from "graphql/error";
import isUrl from "is-url";
import request from "superagent";
import _ from "lodash";
import { organizationCache } from "../models/cacheable_queries/organization";

import { gzip, log, makeTree } from "../../lib";
import { applyScript } from "../../lib/scripts";
import { hasRole } from "../../lib/permissions";
import {
  assignTexters,
  exportCampaign,
  loadContactsFromDataWarehouse,
  uploadContacts
} from "../../workers/jobs";
import {
  Assignment,
  Campaign,
  CannedResponse,
  InteractionStep,
  datawarehouse,
  Invite,
  JobRequest,
  Message,
  Organization,
  QuestionResponse,
  User,
  UserOrganization,
  r,
  cacheableData
} from "../models";
// import { isBetweenTextingHours } from '../../lib/timezones'
import { Notifications, sendUserNotification } from "../notifications";
import {
  resolvers as assignmentResolvers,
  giveUserMoreTexts
} from "./assignment";
import { getCampaigns, resolvers as campaignResolvers } from "./campaign";
import { resolvers as campaignContactResolvers } from "./campaign-contact";
import { resolvers as cannedResponseResolvers } from "./canned-response";
import {
  getConversations,
  getCampaignIdMessageIdsAndCampaignIdContactIdsMaps,
  getCampaignIdMessageIdsAndCampaignIdContactIdsMapsChunked,
  reassignConversations,
  resolvers as conversationsResolver
} from "./conversations";
import {
  accessRequired,
  assignmentRequired,
  authRequired,
  superAdminRequired
} from "./errors";
import { resolvers as interactionStepResolvers } from "./interaction-step";
import { resolvers as inviteResolvers } from "./invite";
import { saveNewIncomingMessage } from "./lib/message-sending";
import serviceMap from "./lib/services";
import { resolvers as messageResolvers } from "./message";
import { resolvers as optOutResolvers } from "./opt-out";
import { resolvers as organizationResolvers } from "./organization";
import { GraphQLPhone } from "./phone";
import { resolvers as questionResolvers } from "./question";
import { resolvers as questionResponseResolvers } from "./question-response";
import { getUsers, resolvers as userResolvers } from "./user";

import { getSendBeforeTimeUtc } from "../../lib/timezones";

const uuidv4 = require("uuid").v4;
const JOBS_SAME_PROCESS = !!(
  process.env.JOBS_SAME_PROCESS || global.JOBS_SAME_PROCESS
);
const JOBS_SYNC = !!(process.env.JOBS_SYNC || global.JOBS_SYNC);

async function editCampaign(id, campaign, loaders, user, origCampaignRecord) {
  const {
    title,
    description,
    dueBy,
    useDynamicAssignment,
    logoImageUrl,
    introHtml,
    primaryColor,
    overrideOrganizationTextingHours,
    textingHoursEnforced,
    textingHoursStart,
    textingHoursEnd,
    timezone
  } = campaign;
  // some changes require ADMIN and we recheck below
  const organizationId =
    campaign.organizationId || origCampaignRecord.organization_id;
  await accessRequired(
    user,
    organizationId,
    "SUPERVOLUNTEER",
    /* superadmin*/ true
  );
  const campaignUpdates = {
    id,
    title,
    description,
    due_by: dueBy,
    organization_id: organizationId,
    use_dynamic_assignment: useDynamicAssignment,
    logo_image_url: isUrl(logoImageUrl) ? logoImageUrl : "",
    primary_color: primaryColor,
    intro_html: introHtml,
    override_organization_texting_hours: overrideOrganizationTextingHours,
    texting_hours_enforced: textingHoursEnforced,
    texting_hours_start: textingHoursStart,
    texting_hours_end: textingHoursEnd,
    timezone
  };

  Object.keys(campaignUpdates).forEach(key => {
    if (typeof campaignUpdates[key] === "undefined") {
      delete campaignUpdates[key];
    }
  });

  if (campaign.hasOwnProperty("contacts") && campaign.contacts) {
    await accessRequired(user, organizationId, "ADMIN", /* superadmin*/ true);
    const contactsToSave = campaign.contacts.map(datum => {
      const modelData = {
        campaign_id: datum.campaignId,
        first_name: datum.firstName,
        last_name: datum.lastName,
        cell: datum.cell,
        external_id: datum.external_id,
        custom_fields: datum.customFields,
        message_status: "needsMessage",
        is_opted_out: false,
        zip: datum.zip
      };
      modelData.campaign_id = id;
      return modelData;
    });
    const jobPayload = {
      excludeCampaignIds: campaign.excludeCampaignIds || [],
      contacts: contactsToSave
    }
    const compressedString = await gzip(JSON.stringify(jobPayload));
    let job = await JobRequest.save({
      queue_name: `${id}:edit_campaign`,
      job_type: "upload_contacts",
      locks_queue: true,
      assigned: JOBS_SAME_PROCESS, // can get called immediately, below
      campaign_id: id,
      // NOTE: stringifying because compressedString is a binary buffer
      payload: compressedString.toString("base64")
    });
    if (JOBS_SAME_PROCESS) {
      uploadContacts(job);
    }
  }
  if (
    campaign.hasOwnProperty("contactSql") &&
    datawarehouse &&
    user.is_superadmin
  ) {
    await accessRequired(user, organizationId, "ADMIN", /* superadmin*/ true);
    let job = await JobRequest.save({
      queue_name: `${id}:edit_campaign`,
      job_type: "upload_contacts_sql",
      locks_queue: true,
      assigned: JOBS_SAME_PROCESS, // can get called immediately, below
      campaign_id: id,
      payload: campaign.contactSql
    });
    if (JOBS_SAME_PROCESS) {
      loadContactsFromDataWarehouse(job);
    }
  }
  if (campaign.hasOwnProperty("texters")) {
    let job = await JobRequest.save({
      queue_name: `${id}:edit_campaign`,
      locks_queue: true,
      assigned: JOBS_SAME_PROCESS, // can get called immediately, below
      job_type: "assign_texters",
      campaign_id: id,
      payload: JSON.stringify({
        id,
        texters: campaign.texters
      })
    });

    if (JOBS_SAME_PROCESS) {
      if (JOBS_SYNC) {
        await assignTexters(job);
      } else {
        assignTexters(job);
      }
    }
  }

  if (campaign.hasOwnProperty("interactionSteps")) {
    // TODO: debug why { script: '' } is even being sent from the client in the first place
    if (!_.isEqual(campaign.interactionSteps, { script: "" })) {
      await accessRequired(
        user,
        organizationId,
        "SUPERVOLUNTEER",
        /* superadmin*/ true
      );
      await updateInteractionSteps(
        id,
        [campaign.interactionSteps],
        origCampaignRecord
      );
    }
  }

  if (campaign.hasOwnProperty("cannedResponses")) {
    const cannedResponses = campaign.cannedResponses;
    const convertedResponses = [];
    for (let index = 0; index < cannedResponses.length; index++) {
      const response = cannedResponses[index];
      const newId = await Math.floor(Math.random() * 10000000);
      convertedResponses.push({
        ...response,
        campaign_id: id,
        id: newId
      });
    }

    await r
      .table("canned_response")
      .getAll(id, { index: "campaign_id" })
      .filter({ user_id: "" })
      .delete();
    await CannedResponse.save(convertedResponses);
    await cacheableData.cannedResponse.clearQuery({
      userId: "",
      campaignId: id
    });
  }

  const newCampaign = await Campaign.get(id).update(campaignUpdates);
  cacheableData.campaign.reload(id);
  return newCampaign || loaders.campaign.load(id);
}

async function updateInteractionSteps(
  campaignId,
  interactionSteps,
  origCampaignRecord,
  idMap = {}
) {
  await interactionSteps.forEach(async is => {
    // map the interaction step ids for new ones
    if (idMap[is.parentInteractionId]) {
      is.parentInteractionId = idMap[is.parentInteractionId];
    }
    if (is.id.indexOf("new") !== -1) {
      const newIstep = await InteractionStep.save({
        parent_interaction_id: is.parentInteractionId || null,
        question: is.questionText,
        script: is.script,
        answer_option: is.answerOption,
        answer_actions: is.answerActions,
        campaign_id: campaignId,
        is_deleted: false
      });
      idMap[is.id] = newIstep.id;
    } else {
      if (!origCampaignRecord.is_started && is.isDeleted) {
        await r
          .knex("interaction_step")
          .where({ id: is.id })
          .delete();
      } else {
        await r
          .knex("interaction_step")
          .where({ id: is.id })
          .update({
            question: is.questionText,
            script: is.script,
            answer_option: is.answerOption,
            answer_actions: is.answerActions,
            is_deleted: is.isDeleted
          });
      }
    }
    await updateInteractionSteps(
      campaignId,
      is.interactionSteps,
      origCampaignRecord,
      idMap
    );
  });
}

const rootMutations = {
  RootMutation: {
    userAgreeTerms: async (_, { userId }, { user, loaders }) => {
      const currentUser = await r
        .table("user")
        .get(userId)
        .update({
          terms: true
        });
      return currentUser;
    },

    sendReply: async (_, { id, message }, { user, loaders }) => {
      const contact = await loaders.campaignContact.load(id);
      const campaign = await loaders.campaign.load(contact.campaign_id);

      await accessRequired(user, campaign.organization_id, "ADMIN");

      const lastMessage = await r
        .table("message")
        .getAll(contact.assignment_id, { index: "assignment_id" })
        .filter({ contact_number: contact.cell })
        .limit(1)(0)
        .default(null);

      if (!lastMessage) {
        throw new GraphQLError({
          status: 400,
          message:
            "Cannot fake a reply to a contact that has no existing thread yet"
        });
      }

      const userNumber = lastMessage.user_number;
      const contactNumber = contact.cell;
      const mockId = `mocked_${Math.random()
        .toString(36)
        .replace(/[^a-zA-Z1-9]+/g, "")}`;
      await saveNewIncomingMessage(
        new Message({
          campaign_contact_id: contact.id,
          contact_number: contactNumber,
          user_number: userNumber,
          is_from_contact: true,
          text: message,
          service_response: JSON.stringify({
            fakeMessage: true,
            userId: user.id,
            userFirstName: user.first_name
          }),
          service_id: mockId,
          assignment_id: lastMessage.assignment_id,
          service: lastMessage.service,
          send_status: "DELIVERED"
        })
      );
      return loaders.campaignContact.load(id);
    },
    exportCampaign: async (_, { id }, { user, loaders }) => {
      const campaign = await loaders.campaign.load(id);
      const organizationId = campaign.organization_id;
      await accessRequired(user, organizationId, "ADMIN");
      const newJob = await JobRequest.save({
        queue_name: `${id}:export`,
        job_type: "export",
        locks_queue: false,
        assigned: JOBS_SAME_PROCESS, // can get called immediately, below
        campaign_id: id,
        payload: JSON.stringify({
          id,
          requester: user.id
        })
      });
      if (JOBS_SAME_PROCESS) {
        exportCampaign(newJob);
      }
      return newJob;
    },
    editOrganizationRoles: async (
      _,
      { userId, organizationId, roles },
      { user, loaders }
    ) => {
      const currentRoles = (await r
        .knex("user_organization")
        .where({
          organization_id: organizationId,
          user_id: userId
        })
        .select("role")).map(res => res.role);
      const oldRoleIsOwner = currentRoles.indexOf("OWNER") !== -1;
      const newRoleIsOwner = roles.indexOf("OWNER") !== -1;
      const roleRequired = oldRoleIsOwner || newRoleIsOwner ? "OWNER" : "ADMIN";
      let newOrgRoles = [];

      await accessRequired(user, organizationId, roleRequired);

      currentRoles.forEach(async curRole => {
        if (roles.indexOf(curRole) === -1) {
          await r
            .table("user_organization")
            .getAll([organizationId, userId], { index: "organization_user" })
            .filter({ role: curRole })
            .delete();
        }
      });

      newOrgRoles = roles
        .filter(newRole => currentRoles.indexOf(newRole) === -1)
        .map(newRole => ({
          organization_id: organizationId,
          user_id: userId,
          role: newRole
        }));

      if (newOrgRoles.length) {
        await UserOrganization.save(newOrgRoles, { conflict: "update" });
      }
      return loaders.organization.load(organizationId);
    },
    editUser: async (_, { organizationId, userId, userData }, { user }) => {
      if (user.id !== userId) {
        // User can edit themselves
        await accessRequired(user, organizationId, "ADMIN", true);
      }
      const userRes = await r
        .knex("user")
        .rightJoin("user_organization", "user.id", "user_organization.user_id")
        .where({
          "user_organization.organization_id": organizationId,
          "user.id": userId
        })
        .limit(1);
      if (!userRes || !userRes.length) {
        return null;
      } else {
        const member = userRes[0];
        if (userData) {
          const userRes = await r
            .knex("user")
            .where("id", userId)
            .update({
              first_name: userData.firstName,
              last_name: userData.lastName,
              email: userData.email,
              cell: userData.cell
            });
          userData = {
            id: userId,
            first_name: userData.firstName,
            last_name: userData.lastName,
            email: userData.email,
            cell: userData.cell
          };
        } else {
          userData = member;
        }
        return userData;
      }
    },
    joinOrganization: async (_, { organizationUuid }, { user, loaders }) => {
      let organization;
      [organization] = await r
        .knex("organization")
        .where("uuid", organizationUuid);
      if (organization) {
        const userOrg = await r
          .table("user_organization")
          .getAll(user.id, { index: "user_id" })
          .filter({ organization_id: organization.id })
          .limit(1)(0)
          .default(null);
        if (!userOrg) {
          await UserOrganization.save({
            user_id: user.id,
            organization_id: organization.id,
            role: "TEXTER"
          }).error(function(error) {
            // Unexpected errors
            log.error("error on userOrganization save", error);
          });
        } else {
          // userOrg exists
          log.error(
            "existing userOrg " +
              userOrg.id +
              " user " +
              user.id +
              " organizationUuid " +
              organizationUuid
          );
        }
      } else {
        // no organization
        log.error(
          "no organization with id " + organizationUuid + " for user " + user.id
        );
      }
      return organization;
    },
    assignUserToCampaign: async (
      _,
      { organizationUuid, campaignId },
      { user, loaders }
    ) => {
      const campaign = await r
        .knex("campaign")
        .leftJoin("organization", "campaign.organization_id", "organization.id")
        .where({
          "campaign.id": campaignId,
          "campaign.use_dynamic_assignment": true,
          "organization.uuid": organizationUuid
        })
        .select("campaign.*")
        .first();
      if (!campaign) {
        throw new GraphQLError({
          status: 403,
          message: "Invalid join request"
        });
      }
      const assignment = await r
        .table("assignment")
        .getAll(user.id, { index: "user_id" })
        .filter({ campaign_id: campaign.id })
        .limit(1)(0)
        .default(null);
      if (!assignment) {
        await Assignment.save({
          user_id: user.id,
          campaign_id: campaign.id,
          max_contacts: parseInt(process.env.MAX_CONTACTS_PER_TEXTER || 0, 10)
        });
      }
      return campaign;
    },
    updateTextingHours: async (
      _,
      { organizationId, textingHoursStart, textingHoursEnd },
      { user }
    ) => {
      await accessRequired(user, organizationId, "OWNER");

      await Organization.get(organizationId).update({
        texting_hours_start: textingHoursStart,
        texting_hours_end: textingHoursEnd
      });
      cacheableData.organization.clear(organizationId);

      return await Organization.get(organizationId);
    },
    updateTextingHoursEnforcement: async (
      _,
      { organizationId, textingHoursEnforced },
      { user, loaders }
    ) => {
      await accessRequired(user, organizationId, "SUPERVOLUNTEER");

      await Organization.get(organizationId).update({
        texting_hours_enforced: textingHoursEnforced
      });
      await cacheableData.organization.clear(organizationId);

      return await loaders.organization.load(organizationId);
    },
    updateOptOutMessage: async (
      _,
      { organizationId, optOutMessage },
      { user }
    ) => {
      await accessRequired(user, organizationId, "OWNER");

      const organization = await Organization.get(organizationId);
      const featuresJSON = JSON.parse(organization.features || "{}");
      featuresJSON.opt_out_message = optOutMessage;
      organization.features = JSON.stringify(featuresJSON);

      await organization.save();
      await organizationCache.clear(organizationId);

      return await Organization.get(organizationId);
    },
    createInvite: async (_, { user }) => {
      if ((user && user.is_superadmin) || !process.env.SUPPRESS_SELF_INVITE) {
        const inviteInstance = new Invite({
          is_valid: true,
          hash: uuidv4()
        });
        const newInvite = await inviteInstance.save();
        return newInvite;
      }
    },
    createCampaign: async (_, { campaign }, { user, loaders }) => {
      await accessRequired(
        user,
        campaign.organizationId,
        "ADMIN",
        /* allowSuperadmin=*/ true
      );
      const campaignInstance = new Campaign({
        organization_id: campaign.organizationId,
        title: campaign.title,
        description: campaign.description,
        due_by: campaign.dueBy,
        is_started: false,
        is_archived: false
      });
      const newCampaign = await campaignInstance.save();
      return editCampaign(newCampaign.id, campaign, loaders, user);
    },
    copyCampaign: async (_, { id }, { user, loaders }) => {
      const campaign = await loaders.campaign.load(id);
      await accessRequired(user, campaign.organization_id, "ADMIN");

      const campaignInstance = new Campaign({
        organization_id: campaign.organization_id,
        title: "COPY - " + campaign.title,
        description: campaign.description,
        due_by: campaign.dueBy,
        is_started: false,
        is_archived: false
      });
      const newCampaign = await campaignInstance.save();
      const newCampaignId = newCampaign.id;
      const oldCampaignId = campaign.id;

      let interactions = await r
        .knex("interaction_step")
        .where({ campaign_id: oldCampaignId });

      const interactionsArr = [];
      interactions.forEach((interaction, index) => {
        if (interaction.parent_interaction_id) {
          let is = {
            id: "new" + interaction.id,
            questionText: interaction.question,
            script: interaction.script,
            answerOption: interaction.answer_option,
            answerActions: interaction.answer_actions,
            isDeleted: interaction.is_deleted,
            campaign_id: newCampaignId,
            parentInteractionId: "new" + interaction.parent_interaction_id
          };
          interactionsArr.push(is);
        } else if (!interaction.parent_interaction_id) {
          let is = {
            id: "new" + interaction.id,
            questionText: interaction.question,
            script: interaction.script,
            answerOption: interaction.answer_option,
            answerActions: interaction.answer_actions,
            isDeleted: interaction.is_deleted,
            campaign_id: newCampaignId,
            parentInteractionId: interaction.parent_interaction_id
          };
          interactionsArr.push(is);
        }
      });

      let createSteps = updateInteractionSteps(
        newCampaignId,
        [makeTree(interactionsArr, (id = null))],
        campaign,
        {}
      );

      await createSteps;

      let createCannedResponses = r
        .knex("canned_response")
        .where({ campaign_id: oldCampaignId })
        .then(function(res) {
          res.forEach((response, index) => {
            const copiedCannedResponse = new CannedResponse({
              campaign_id: newCampaignId,
              title: response.title,
              text: response.text
            }).save();
          });
        });

      await createCannedResponses;

      return newCampaign;
    },
    unarchiveCampaign: async (_, { id }, { user, loaders }) => {
      const campaign = await loaders.campaign.load(id);
      await accessRequired(user, campaign.organization_id, "ADMIN");
      campaign.is_archived = false;
      await campaign.save();
      cacheableData.campaign.reload(id);
      return campaign;
    },
    archiveCampaign: async (_, { id }, { user, loaders }) => {
      const campaign = await loaders.campaign.load(id);
      await accessRequired(user, campaign.organization_id, "ADMIN");
      campaign.is_archived = true;
      await campaign.save();
      cacheableData.campaign.reload(id);
      return campaign;
    },
    startCampaign: async (_, { id }, { user, loaders }) => {
      const campaign = await loaders.campaign.load(id);
      await accessRequired(user, campaign.organization_id, "ADMIN");
      campaign.is_started = true;

      await campaign.save();
      cacheableData.campaign.reload(id);
      await sendUserNotification({
        type: Notifications.CAMPAIGN_STARTED,
        campaignId: id
      });
      return campaign;
    },
    editCampaign: async (_, { id, campaign }, { user, loaders }) => {
      const origCampaign = await Campaign.get(id);
      if (campaign.organizationId) {
        await accessRequired(user, campaign.organizationId, "ADMIN");
      } else {
        await accessRequired(
          user,
          origCampaign.organization_id,
          "SUPERVOLUNTEER"
        );
      }
      if (
        origCampaign.is_started &&
        campaign.hasOwnProperty("contacts") &&
        campaign.contacts
      ) {
        throw new GraphQLError({
          status: 400,
          message: "Not allowed to add contacts after the campaign starts"
        });
      }
      return editCampaign(id, campaign, loaders, user, origCampaign);
    },
    deleteJob: async (_, { campaignId, id }, { user, loaders }) => {
      const campaign = await Campaign.get(campaignId);
      await accessRequired(user, campaign.organization_id, "ADMIN");
      const res = await r
        .knex("job_request")
        .where({
          id,
          campaign_id: campaignId
        })
        .delete();
      return { id };
    },
    createCannedResponse: async (_, { cannedResponse }, { user, loaders }) => {
      authRequired(user);

      const cannedResponseInstance = new CannedResponse({
        campaign_id: cannedResponse.campaignId,
        user_id: cannedResponse.userId,
        title: cannedResponse.title,
        text: cannedResponse.text
      }).save();
      // deletes duplicate created canned_responses
      let query = r
        .knex("canned_response")
        .where(
          "text",
          "in",
          r
            .knex("canned_response")
            .where({
              text: cannedResponse.text,
              campaign_id: cannedResponse.campaignId
            })
            .select("text")
        )
        .andWhere({ user_id: cannedResponse.userId })
        .del();
      await query;
      cacheableData.cannedResponse.clearQuery({
        campaignId: cannedResponse.campaignId,
        userId: cannedResponse.userId
      });
    },
    createOrganization: async (
      _,
      { name, userId, inviteId },
      { loaders, user }
    ) => {
      authRequired(user);
      const invite = await loaders.invite.load(inviteId);
      if (!invite || !invite.is_valid) {
        throw new GraphQLError({
          status: 400,
          message: "That invitation is no longer valid"
        });
      }

      const newOrganization = await Organization.save({
        name,
        uuid: uuidv4()
      });
      await UserOrganization.save({
        role: "OWNER",
        user_id: userId,
        organization_id: newOrganization.id
      });
      await Invite.save(
        {
          id: inviteId,
          is_valid: false
        },
        { conflict: "update" }
      );

      return newOrganization;
    },
    editCampaignContactMessageStatus: async (
      _,
      { messageStatus, campaignContactId },
      { loaders, user }
    ) => {
      const contact = await loaders.campaignContact.load(campaignContactId);
      await assignmentRequired(user, contact.assignment_id);
      contact.message_status = messageStatus;
      return await contact.save();
    },
    getAssignmentContacts: async (
      _,
      { assignmentId, contactIds, findNew },
      { loaders, user }
    ) => {
      await assignmentRequired(user, assignmentId);
      const contacts = contactIds.map(async contactId => {
        const contact = await loaders.campaignContact.load(contactId);
        if (contact && contact.assignment_id === Number(assignmentId)) {
          return contact;
        }
        return null;
      });
      if (findNew) {
        // maybe TODO: we could automatically add dynamic assignments in the same api call
        // findNewCampaignContact()
      }
      return contacts;
    },
    findNewCampaignContact: async (
      _,
      { assignmentId, numberContacts },
      { loaders, user }
    ) => {
      /* This attempts to find a new contact for the assignment, in the case that useDynamicAssigment == true */
      const assignment = await Assignment.get(assignmentId);
      if (assignment.user_id != user.id) {
        throw new GraphQLError({
          status: 400,
          message: "Invalid assignment"
        });
      }
      const campaign = await Campaign.get(assignment.campaign_id);
      if (!campaign.use_dynamic_assignment || assignment.max_contacts === 0) {
        return { found: false };
      }

      const contactsCount = await r.getCount(
        r.knex("campaign_contact").where("assignment_id", assignmentId)
      );

      numberContacts = numberContacts || 1;
      if (
        assignment.max_contacts &&
        contactsCount + numberContacts > assignment.max_contacts
      ) {
        numberContacts = assignment.max_contacts - contactsCount;
      }
      // Don't add more if they already have that many
      const result = await r.getCount(
        r.knex("campaign_contact").where({
          assignment_id: assignmentId,
          message_status: "needsMessage",
          is_opted_out: false
        })
      );
      if (result >= numberContacts) {
        return { found: false };
      }

      const updateResult = await r
        .knex("campaign_contact")
        .where({
          assignment_id: null,
          campaign_id: campaign.id
        })
        .limit(numberContacts)
        .update({ assignment_id: assignmentId })
        .catch(log.error);

      if (updateResult > 0) {
        return { found: true };
      } else {
        return { found: false };
      }
    },

    createOptOut: async (
      _,
      { optOut, campaignContactId },
      { loaders, user }
    ) => {
      const contact = await loaders.campaignContact.load(campaignContactId);
      let organizationId = contact.organization_id;
      if (!organizationId) {
        const campaign = await loaders.campaign.load(contact.campaign_id);
        organizationId = campaign.organization_id;
      }
      try {
        await assignmentRequired(user, contact.assignment_id);
      } catch (error) {
        await accessRequired(user, organizationId, "SUPERVOLUNTEER");
      }

      const { assignmentId, cell, reason } = optOut;
      await cacheableData.optOut.save({
        cell,
        reason,
        assignmentId,
        organizationId
      });

      return loaders.campaignContact.load(campaignContactId);
    },
    removeOptOut: async (_, { cell }, { loaders, user }) => {
      // We assume that OptOuts are shared across orgs
      // const sharingOptOuts = !!process.env.OPTOUTS_SHARE_ALL_ORGS

      // Authorization (checking across all organizations)
      let userRoles = await r
        .knex("user_organization")
        .where({ user_id: user.id })
        .select("role");
      userRoles = userRoles.map(role => role.role);
      userRoles = Array.from(new Set(userRoles));
      const isAdmin = hasRole("SUPERVOLUNTEER", userRoles);
      if (!isAdmin) {
        throw new GraphQLError(
          "You are not authorized to access that resource."
        );
      }

      await r.knex.transaction(trx => {
        // Remove all references in the opt out table
        const optOuts = r
          .knex("opt_out")
          .transacting(trx)
          .where({ cell })
          .del();
        // Update all "cached" values for campaign contacts
        const contactUpdates = r
          .knex("campaign_contact")
          .transacting(trx)
          .where(
            "id",
            "in",
            r
              .knex("campaign_contact")
              .leftJoin(
                "campaign",
                "campaign_contact.campaign_id",
                "campaign.id"
              )
              .where({
                "campaign_contact.cell": cell,
                "campaign.is_archived": false
              })
              .select("campaign_contact.id")
          )
          .update({
            is_opted_out: false
          });

        Promise.all([optOuts, contactUpdates])
          .then(trx.commit)
          .catch(trx.rollback);
      });

      // We don't care about Redis
      // await cacheableData.optOut.clearCache(...)

      return true;
    },
    bulkSendMessages: async (_, { assignmentId }, loaders) => {
      if (!process.env.ALLOW_SEND_ALL || !process.env.NOT_IN_USA) {
        log.error("Not allowed to send all messages at once");
        throw new GraphQLError({
          status: 403,
          message: "Not allowed to send all messages at once"
        });
      }

      const assignment = await Assignment.get(assignmentId);
      const campaign = await Campaign.get(assignment.campaign_id);
      // Assign some contacts
      await rootMutations.RootMutation.findNewCampaignContact(
        _,
        {
          assignmentId,
          numberContacts: Number(process.env.BULK_SEND_CHUNK_SIZE) - 1
        },
        loaders
      );

      const contacts = await r
        .knex("campaign_contact")
        .where({ message_status: "needsMessage" })
        .where({ assignment_id: assignmentId })
        .orderByRaw("updated_at")
        .limit(process.env.BULK_SEND_CHUNK_SIZE);

      const texter = camelCaseKeys(await User.get(assignment.user_id));
      const customFields = Object.keys(JSON.parse(contacts[0].custom_fields));

      const contactMessages = await contacts.map(async contact => {
        const script = await campaignContactResolvers.CampaignContact.currentInteractionStepScript(
          contact
        );
        contact.customFields = contact.custom_fields;
        const text = applyScript({
          contact: camelCaseKeys(contact),
          texter,
          script,
          customFields
        });
        const contactMessage = {
          contactNumber: contact.cell,
          userId: assignment.user_id,
          text,
          assignmentId
        };
        await rootMutations.RootMutation.sendMessage(
          _,
          { message: contactMessage, campaignContactId: contact.id },
          loaders
        );
      });

      return [];
    },
    // We've modified campaign creation on the client so that overrideOrganizationHours is always true
    // and enforce_texting_hours is always true
    // as a result, we're forcing admins to think about the time zone of each campaign
    // and saving a join on this query.
    sendMessage: async (
      _,
      { message, campaignContactId },
      { user, loaders }
    ) => {
      const record = (await r
        .knex("campaign_contact")
        .join("campaign", "campaign_contact.campaign_id", "campaign.id")
        .where({ "campaign_contact.id": parseInt(campaignContactId) })
        .where({ "campaign.is_archived": false })
        .where({
          "campaign_contact.assignment_id": parseInt(message.assignmentId)
        })
        .join("assignment", "campaign_contact.assignment_id", "assignment.id")
        .leftJoin("opt_out", {
          // 'opt_out.organization_id': 'campaign.organization.id',
          "opt_out.cell": "campaign_contact.cell"
        })
        .select(
          "campaign_contact.id as cc_id",
          "campaign_contact.assignment_id as assignment_id",
          "campaign_contact.message_status as cc_message_status",
          "campaign.is_archived as is_archived",
          "campaign.organization_id as organization_id",
          "campaign.override_organization_texting_hours as c_override_hours",
          "campaign.timezone as c_timezone",
          "campaign.texting_hours_end as c_texting_hours_end",
          "campaign.texting_hours_enforced as c_texting_hours_enforced",
          "assignment.user_id as a_assignment_user_id",
          "opt_out.id as is_opted_out",
          "campaign_contact.timezone_offset as contact_timezone_offset"
        ))[0];

      if (!record) {
        throw new GraphQLError("Your assignment has changed");
      }

      // setting defaults based on new forced conditions
      record.o_texting_hours_enforced = true;
      record.o_texting_hours_end = 21;

      // This block will only need to be evaluated if message is sent from admin Message Review
      if (record.a_assignment_user_id !== user.id) {
        const currentRoles = await r
          .knex("user_organization")
          .where({
            user_id: user.id,
            organization_id: record.organization_id
          })
          .pluck("role");
        const isAdmin = hasRole("SUPERVOLUNTEER", currentRoles);
        if (!isAdmin) {
          throw new GraphQLError(
            "You are not authorized to send a message for this assignment!"
          );
        }
      }

      if (!!record.is_opted_out) {
        throw new GraphQLError(
          "Skipped sending because this contact was already opted out"
        );
      }

      // const zipData = await r.table('zip_code')
      //   .get(contact.zip)
      //   .default(null)

      // const config = {
      //   textingHoursEnforced: organization.texting_hours_enforced,
      //   textingHoursStart: organization.texting_hours_start,
      //   textingHoursEnd: organization.texting_hours_end,
      // }
      // const offsetData = zipData ? { offset: zipData.timezone_offset, hasDST: zipData.has_dst } : null
      // if (!isBetweenTextingHours(offsetData, config)) {
      //   throw new GraphQLError({
      //     status: 400,
      //     message: "Skipped sending because it's now outside texting hours for this contact"
      //   })
      // }

      const { contactNumber, text } = message;

      if (text.length > (process.env.MAX_MESSAGE_LENGTH || 99999)) {
        throw new GraphQLError("Message was longer than the limit");
      }

      const replaceCurlyApostrophes = rawText =>
        rawText.replace(/[\u2018\u2019]/g, "'");

      let contactTimezone = {};
      if (record.contact_timezone_offset) {
        // couldn't look up the timezone by zip record, so we load it
        // from the campaign_contact directly if it's there
        const [offset, hasDST] = record.contact_timezone_offset.split("_");
        contactTimezone.offset = parseInt(offset, 10);
        contactTimezone.hasDST = hasDST === "1";
      }

      const {
        c_override_hours,
        c_timezone,
        c_texting_hours_end,
        c_texting_hours_enforced,
        o_texting_hours_enforced,
        o_texting_hours_end
      } = record;
      const sendBefore = getSendBeforeTimeUtc(
        contactTimezone,
        {
          textingHoursEnd: o_texting_hours_end,
          textingHoursEnforced: o_texting_hours_enforced
        },
        {
          textingHoursEnd: c_texting_hours_end,
          overrideOrganizationTextingHours: c_override_hours,
          textingHoursEnforced: c_texting_hours_enforced,
          timezone: c_timezone
        }
      );

      const sendBeforeDate = sendBefore ? sendBefore.toDate() : null;

      if (sendBeforeDate && sendBeforeDate <= Date.now()) {
        throw new GraphQLError(
          "Outside permitted texting time for this recipient"
        );
      }

      const toInsert = {
        user_id: user.id,
        campaign_contact_id: campaignContactId,
        text: replaceCurlyApostrophes(text),
        contact_number: contactNumber,
        user_number: "",
        assignment_id: message.assignmentId,
        send_status: JOBS_SAME_PROCESS ? "SENDING" : "QUEUED",
        service: process.env.DEFAULT_SERVICE || "",
        is_from_contact: false,
        queued_at: new Date(),
        send_before: sendBeforeDate
      };

      const messageSavePromise = r
        .knex("message")
        .insert(toInsert)
        .returning(Object.keys(toInsert).concat(["id"]));

      const { cc_message_status } = record;
      const contactSavePromise = (async () => {
        await r
          .knex("campaign_contact")
          .update({
            updated_at: r.knex.fn.now(),
            message_status:
              cc_message_status === "needsResponse" ||
              cc_message_status === "convo"
                ? "convo"
                : "messaged"
          })
          .where({ id: record.cc_id });

        const contact = await r
          .knex("campaign_contact")
          .select("*")
          .where({ id: record.cc_id })
          .first();
        return contact;
      })();

      const [messageInsertResult, contactUpdateResult] = await Promise.all([
        messageSavePromise,
        contactSavePromise
      ]);
      const messageInstance = Array.isArray(messageInsertResult)
        ? messageInsertResult[0]
        : messageInsertResult;
      toInsert.id = messageInstance.id || messageInstance;

      // Send message after we are sure messageInstance has been persisted
      const service =
        serviceMap[messageInstance.service || process.env.DEFAULT_SERVICE];
      service.sendMessage(toInsert);

      // Send message to BernieSMS to be checked for bad words
      const badWordUrl = process.env.TFB_BAD_WORD_URL
      if (badWordUrl) {
        request
          .post(process.env.TFB_BAD_WORD_URL)
          .set("Authorization", `Token ${process.env.TFB_TOKEN}`)
          .send({ user_id: user.auth0_id, message: toInsert.text })
          then(log.info, log.error)
      }

      return contactUpdateResult;
    },
    deleteQuestionResponses: async (
      _,
      { interactionStepIds, campaignContactId },
      { loaders, user }
    ) => {
      const contact = await loaders.campaignContact.load(campaignContactId);
      await assignmentRequired(user, contact.assignment_id);
      // TODO: maybe undo action_handler
      await r
        .table("question_response")
        .getAll(campaignContactId, { index: "campaign_contact_id" })
        .getAll(...interactionStepIds, { index: "interaction_step_id" })
        .delete();
      return contact;
    },
    updateQuestionResponses: async (
      _,
      { questionResponses, campaignContactId },
      { loaders }
    ) => {
      const count = questionResponses.length;

      for (let i = 0; i < count; i++) {
        const questionResponse = questionResponses[i];
        const { interactionStepId, value } = questionResponse;
        await r
          .table("question_response")
          .getAll(campaignContactId, { index: "campaign_contact_id" })
          .filter({ interaction_step_id: interactionStepId })
          .delete();

        // TODO: maybe undo action_handler if updated answer

        const qr = await new QuestionResponse({
          campaign_contact_id: campaignContactId,
          interaction_step_id: interactionStepId,
          value
        }).save();
        const interactionStepResult = await r
          .knex("interaction_step")
          // TODO: is this really parent_interaction_id or just interaction_id?
          .where({
            parent_interaction_id: interactionStepId,
            answer_option: value
          })
          .whereNot("answer_actions", "")
          .whereNotNull("answer_actions");

        const interactionStepAction =
          interactionStepResult.length &&
          interactionStepResult[0].answer_actions;
        if (interactionStepAction) {
          // run interaction step handler
          try {
            const handler = require(`../action_handlers/${interactionStepAction}.js`);
            handler.processAction(
              qr,
              interactionStepResult[0],
              campaignContactId
            );
          } catch (err) {
            log.error(
              "Handler for InteractionStep",
              interactionStepId,
              "Does Not Exist:",
              interactionStepAction
            );
          }
        }
      }

      const contact = loaders.campaignContact.load(campaignContactId);
      return contact;
    },
    markForSecondPass: async (
      _ignore,
      { organizationId, campaignIdsContactIds },
      { user }
    ) => {
      // verify permissions
      await accessRequired(user, organizationId, "SUPERVOLUNTEER", true);

      let affectedCampaignContactIds = [];
      const groupedByCampaign = _.groupBy(
        campaignIdsContactIds,
        c => c.campaignId
      );

      await Promise.all(
        Object.keys(groupedByCampaign).map(async campaignId => {
          const campaignContactIds = groupedByCampaign[campaignId].map(
            c => c.campaignContactId
          );
          affectedCampaignContactIds = affectedCampaignContactIds.concat(
            campaignContactIds
          );
          return r
            .knex("campaign_contact")
            .update({ message_status: "needsMessage" })
            .where({ campaign_id: campaignId })
            .whereIn("id", campaignContactIds);
        })
      );

      return affectedCampaignContactIds.map(id => {
        id;
      });
    },
    reassignCampaignContacts: async (
      _,
      { organizationId, campaignIdsContactIds, newTexterUserId },
      { user }
    ) => {
      // verify permissions
      await accessRequired(user, organizationId, "ADMIN", /* superadmin*/ true);

      // group contactIds by campaign
      // group messages by campaign
      const campaignIdContactIdsMap = new Map();
      const campaignIdMessagesIdsMap = new Map();
      for (const campaignIdContactId of campaignIdsContactIds) {
        const {
          campaignId,
          campaignContactId,
          messageIds
        } = campaignIdContactId;

        if (!campaignIdContactIdsMap.has(campaignId)) {
          campaignIdContactIdsMap.set(campaignId, []);
        }

        campaignIdContactIdsMap.get(campaignId).push(campaignContactId);

        if (!campaignIdMessagesIdsMap.has(campaignId)) {
          campaignIdMessagesIdsMap.set(campaignId, []);
        }

        campaignIdMessagesIdsMap.get(campaignId).push(...messageIds);
      }

      return await reassignConversations(
        campaignIdContactIdsMap,
        campaignIdMessagesIdsMap,
        newTexterUserId
      );
    },
    megaReassignCampaignContacts: async (
      _ignore,
      { organizationId, campaignIdsContactIds, newTexterUserIds },
      { user }
    ) => {
      // verify permissions
      await accessRequired(user, organizationId, "ADMIN", /* superadmin*/ true);

      // group contactIds by campaign
      // group messages by campaign
      const campaignIdContactIdsMap = new Map();
      const campaignIdMessagesIdsMap = new Map();

      const aggregated = {}
      const campaignContactIdsToMessageIds = campaignIdsContactIds.forEach(campaignIdContactId => {
        aggregated[campaignIdContactId.campaignContactId] = {
          campaign_id: campaignIdContactId.campaignId,
          messages: campaignIdContactId.messageIds
        }
      })
      const result = Object.entries(aggregated)
      const numberOfCampaignContactsToReassign = result.length
      const numberOfCampaignContactsPerNextTexter = Math.ceil(numberOfCampaignContactsToReassign / newTexterUserIds.length)
      const response = []
      const chunks = _.chunk(result, numberOfCampaignContactsPerNextTexter)
      for (let [idx, chunk] of chunks.entries()) {
        const byCampaignId = _.groupBy(chunk, x => x[1].campaign_id)
        const campaignIdContactIdsMap = new Map()
        const campaignIdMessageIdsMap = new Map()


        Object.keys(byCampaignId).forEach(campaign_id => {
          chunk.filter(x => x[1].campaign_id === campaign_id).forEach(x => {
            if (!campaignIdContactIdsMap.has(campaign_id)) campaignIdContactIdsMap.set(campaign_id, [])
            if (!campaignIdMessageIdsMap.has(campaign_id)) campaignIdMessageIdsMap.set(campaign_id, [])
            campaignIdContactIdsMap.get(campaign_id).push(x[0])
            x[1].messages.forEach(message_id => {
              campaignIdMessageIdsMap.get(campaign_id).push(message_id)
            })
          })
        })


        const responses = await reassignConversations(
          campaignIdContactIdsMap,
          campaignIdMessagesIdsMap,
          newTexterUserIds[idx]
        );
        for (let r of responses) {
          response.push(r)
        }
      }

      return response;
    },
    bulkReassignCampaignContacts: async (
      _,
      {
        organizationId,
        campaignsFilter,
        assignmentsFilter,
        contactsFilter,
        newTexterUserId
      },
      { user }
    ) => {
      // verify permissions
      await accessRequired(user, organizationId, "ADMIN", /* superadmin*/ true);

      console.log('megaBulk newTexterUserIds', newTexterUserIds)

      const {
        campaignIdContactIdsMap,
        campaignIdMessagesIdsMap
      } = await getCampaignIdMessageIdsAndCampaignIdContactIdsMaps(
        organizationId,
        campaignsFilter,
        assignmentsFilter,
        contactsFilter
      );

      return await reassignConversations(
        campaignIdContactIdsMap,
        campaignIdMessagesIdsMap,
        newTexterUserId
      );
    },
    megaBulkReassignCampaignContacts: async (
      _ignore,
      {
        organizationId,
        campaignsFilter,
        assignmentsFilter,
        contactsFilter,
        newTexterUserIds
      },
      { user }
    ) => {
      // verify permissions
      await accessRequired(user, organizationId, "ADMIN", /* superadmin*/ true);

      const campaignContactIdsToMessageIds = await getCampaignIdMessageIdsAndCampaignIdContactIdsMapsChunked(
        organizationId,
        campaignsFilter,
        assignmentsFilter,
        contactsFilter
      )

      const numberOfCampaignContactsToReassign = campaignContactIdsToMessageIds.length
      const numberOfCampaignContactsPerNextTexter = Math.ceil(numberOfCampaignContactsToReassign / newTexterUserIds.length)
      const response = []
      const chunks = _.chunk(campaignContactIdsToMessageIds, numberOfCampaignContactsPerNextTexter)
      for (let [idx, chunk] of chunks.entries()) {
        const byCampaignId = _.groupBy(chunk, x => x[1].campaign_id)
        const campaignIdContactIdsMap = new Map()
        const campaignIdMessageIdsMap = new Map()

        Object.keys(byCampaignId).forEach(campaign_id => {
          chunk.filter(x => x[1].campaign_id === parseInt(campaign_id)).forEach(x => {
            if (!campaignIdContactIdsMap.has(campaign_id)) campaignIdContactIdsMap.set(campaign_id, [])
            if (!campaignIdMessageIdsMap.has(campaign_id)) campaignIdMessageIdsMap.set(campaign_id, [])
            campaignIdContactIdsMap.get(campaign_id).push(x[0])
            x[1].messages.forEach(message_id => {
              campaignIdMessageIdsMap.get(campaign_id).push(message_id)
            })
          })
        })

        const responses = await reassignConversations(
          campaignIdContactIdsMap,
          campaignIdMessageIdsMap,
          newTexterUserIds[idx]
        );
        for (let r of responses) {
          response.push(r)
        }
      }

      return response;
    },
    requestTexts: async (_, { count, email }, { user }) => {
      try {
        const response = await request
          .post(process.env.TFB_URL)
          .set("Authorization", `Token ${process.env.TFB_TOKEN}`)
          .send({ count, email });

        if (response.body.is_autoapproved) {
          await giveUserMoreTexts(user.auth0_id, count);
        }

        return response.body.message;
      } catch (e) {
        return e.response.body.message;
      }
    }
  }
};

const rootResolvers = {
  Action: {
    name: o => o.name,
    display_name: o => o.display_name,
    instructions: o => o.instructions
  },
  FoundContact: {
    found: o => o.found
  },
  RootQuery: {
    campaign: async (_, { id }, { loaders, user }) => {
      const campaign = await loaders.campaign.load(id);
      await accessRequired(user, campaign.organization_id, "SUPERVOLUNTEER");
      return campaign;
    },
    assignment: async (_, { id }, { loaders, user }) => {
      authRequired(user);
      const assignment = await loaders.assignment.load(id);
      const campaign = await loaders.campaign.load(assignment.campaign_id);
      if (assignment.user_id == user.id) {
        await accessRequired(
          user,
          campaign.organization_id,
          "TEXTER",
          /* allowSuperadmin=*/ true
        );
      } else {
        await accessRequired(
          user,
          campaign.organization_id,
          "SUPERVOLUNTEER",
          /* allowSuperadmin=*/ true
        );
      }
      return assignment;
    },
    organization: async (_, { id }, { loaders }) =>
      loaders.organization.load(id),
    inviteByHash: async (_, { hash }, { loaders, user }) => {
      authRequired(user);
      return r.table("invite").filter({ hash });
    },
    currentUser: async (_, { id }, { user }) => {
      if (!user) {
        return null;
      } else {
        return user;
      }
    },
    contact: async (_, { id }, { loaders, user }) => {
      authRequired(user);
      const contact = await loaders.campaignContact.load(id);
      const campaign = await loaders.campaign.load(contact.campaign_id);
      await accessRequired(
        user,
        campaign.organization_id,
        "TEXTER",
        /* allowSuperadmin=*/ true
      );
      return contact;
    },
    organizations: async (_, { id }, { user }) => {
      await superAdminRequired(user);
      return r.table("organization");
    },
    availableActions: (_, { organizationId }, { user }) => {
      if (!process.env.ACTION_HANDLERS) {
        return [];
      }
      const allHandlers = process.env.ACTION_HANDLERS.split(",");

      const availableHandlers = allHandlers
        .map(handler => {
          return {
            name: handler,
            handler: require(`../action_handlers/${handler}.js`)
          };
        })
        .filter(async h => h && (await h.handler.available(organizationId)));

      const availableHandlerObjects = availableHandlers.map(handler => {
        return {
          name: handler.name,
          display_name: handler.handler.displayName(),
          instructions: handler.handler.instructions()
        };
      });
      return availableHandlerObjects;
    },
    conversations: async (
      _,
      {
        cursor,
        organizationId,
        campaignsFilter,
        assignmentsFilter,
        contactsFilter,
        utc
      },
      { user }
    ) => {
      await accessRequired(user, organizationId, "SUPERVOLUNTEER", true);

      return getConversations(
        cursor,
        organizationId,
        campaignsFilter,
        assignmentsFilter,
        contactsFilter,
        utc
      );
    },
    campaigns: async (
      _,
      { organizationId, cursor, campaignsFilter },
      { user }
    ) => {
      await accessRequired(user, organizationId, "SUPERVOLUNTEER");
      return getCampaigns(organizationId, cursor, campaignsFilter);
    },
    people: async (
      _,
      { organizationId, cursor, campaignsFilter, role },
      { user }
    ) => {
      await accessRequired(user, organizationId, "SUPERVOLUNTEER");
      return getUsers(organizationId, cursor, campaignsFilter, role);
    }
  }
};

export const resolvers = {
  ...rootResolvers,
  ...userResolvers,
  ...organizationResolvers,
  ...campaignResolvers,
  ...assignmentResolvers,
  ...interactionStepResolvers,
  ...optOutResolvers,
  ...messageResolvers,
  ...campaignContactResolvers,
  ...cannedResponseResolvers,
  ...questionResponseResolvers,
  ...inviteResolvers,
  ...{ Date: GraphQLDate },
  ...{ JSON: GraphQLJSON },
  ...{ Phone: GraphQLPhone },
  ...questionResolvers,
  ...conversationsResolver,
  ...rootMutations
};
