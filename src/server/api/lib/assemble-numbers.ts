import type { Knex } from "knex";
import type { PoolClient } from "pg";

import { config } from "../../../config";
import { getFormattedPhoneNumber } from "../../../lib/phone-format";
import { getMessageType } from "../../../lib/scripts";
import { stringIsAValidUrl } from "../../../lib/utils";
import logger from "../../../logger";
import { makeNumbersClient } from "../../lib/assemble-numbers";
import { r } from "../../models";
import statsd from "../../statsd";
import { errToObj } from "../../utils";
import type { MessagingServiceRecord, RequestHandlerFactory } from "../types";
import { MessagingServiceType } from "../types";
import { symmetricDecrypt } from "./crypto";
import {
  getCampaignContactAndAssignmentForIncomingMessage,
  getContactMessagingService,
  getMessagingServiceById,
  messageComponents,
  saveNewIncomingMessage,
  SpokeSendStatus
} from "./message-sending";
import type { SendMessagePayload } from "./types";

export enum NumbersSendStatus {
  Queued = "queued",
  Sending = "sending",
  Sent = "sent",
  Delivered = "delivered",
  SendingFailed = "sending_failed",
  DeliveryFailed = "delivery_failed",
  DeliveryUnconfirmed = "delivery_unconfirmed"
}

// client lib does not export this, so we recreate
interface NumbersOutboundMessagePayload {
  profileId: string;
  to: string;
  body: string;
  mediaUrls?: any; // client lib has incorrect type [string]
  contactZipCode?: string;
  sendBefore: string;
}

interface NumbersInboundMessagePayload {
  id: string;
  from: string;
  to: string;
  body: string;
  receivedAt: string;
  numSegments: number;
  numMedia: number;
  mediaUrls: string[];
  profileId: string;
  sendingLocationId: string;
}

export interface NumbersDeliveryReportPayload {
  errorCodes: string[];
  eventType: NumbersSendStatus;
  generatedAt: string;
  messageId: string;
  profileId: string;
  sendingLocationId: string;
  extra?: {
    num_segments?: number;
    num_media?: number;
  };
}

/**
 * Create an Assemble Numbers client
 * @param {object} numbersService Assemble Numbers Messaging Service record
 * @returns Assemble Numbers JS client
 */
export const numbersClient = async (service: MessagingServiceRecord) => {
  const {
    account_sid: endpointBaseUrlMaybe,
    encrypted_auth_token: encryptedApiKey
  } = service;
  const endpointBaseUrl = stringIsAValidUrl(endpointBaseUrlMaybe)
    ? endpointBaseUrlMaybe
    : undefined;
  const apiKey = symmetricDecrypt(encryptedApiKey);
  const client = makeNumbersClient({ apiKey, endpointBaseUrl });
  return client;
};

export const inboundMessageValidator: RequestHandlerFactory = () => async (
  req,
  res,
  next
) => {
  // Check if the 'x-assemble-signature' header exists or not
  if (!req.header("x-assemble-signature")) {
    return res
      .type("text/plain")
      .status(400)
      .send(
        "No signature header error - x-assemble-signature header does not exist, maybe this request is not coming from Assemble."
      );
  }

  const signature = req.header("x-assemble-signature") ?? "";
  const { id: messageId, profileId } = req.body;

  const service = await getMessagingServiceById(profileId);
  const numbers = await numbersClient(service);
  const isValid = numbers.validateInboundMessageWebhook(messageId, signature);

  if (isValid) {
    next();
  } else {
    return res
      .type("text/plain")
      .status(403)
      .send("Assemble Request Validation Failed.");
  }
};

export const deliveryReportValidator: RequestHandlerFactory = () => async (
  req,
  res,
  next
) => {
  // Check if the 'x-assemble-signature' header exists or not
  if (!req.header("x-assemble-signature")) {
    return res
      .type("text/plain")
      .status(400)
      .send(
        "No signature header error - x-assemble-signature header does not exist, maybe this request is not coming from Assemble."
      );
  }

  const signature = req.header("x-assemble-signature") ?? "";
  const { id: messageId, eventType, profileId } = req.body;

  const service = await getMessagingServiceById(profileId);
  const numbers = await numbersClient(service);
  const isValid = numbers.validateDeliveryReportWebhook(
    messageId,
    eventType,
    signature
  );

  if (isValid) {
    next();
  } else {
    return res
      .type("text/plain")
      .status(403)
      .send("Assemble Request Validation Failed.");
  }
};

export const sendMessage = async (
  message: SendMessagePayload,
  organizationId: number,
  _trx?: Knex
) => {
  const {
    id: spokeMessageId,
    campaign_contact_id: campaignContactId,
    contact_number: to,
    text: messageText,
    send_before: sendBefore
  } = message;
  const service = await getContactMessagingService(
    campaignContactId,
    organizationId
  );
  const profileId = service.messaging_service_sid;
  const numbers = await numbersClient(service);

  const { zip: contactZipCode } = await r
    .reader("campaign_contact")
    .where({ id: campaignContactId })
    .first("zip");

  const { maxSmsSegmentLength } = await r
    .reader("organization")
    .where({ id: organizationId })
    .first("features")
    .then(({ features }) => JSON.parse(features))
    .catch(() => ({}));

  const { body, mediaUrl } = messageComponents(messageText);

  const mediaUrls = mediaUrl
    ? [mediaUrl]
    : // check if we should convert to switchboard format for empty mms
    getMessageType(body, maxSmsSegmentLength) === "MMS"
    ? []
    : undefined;

  const messageInput: NumbersOutboundMessagePayload = {
    profileId,
    to,
    body,
    mediaUrls,
    sendBefore,
    contactZipCode: contactZipCode === "" ? null : contactZipCode
  };

  try {
    const result = await numbers.sms.sendMessage(messageInput);
    const { data, errors } = result;

    if (errors && errors.length > 0) throw new Error(errors[0].message);

    statsd.increment("send_message.assemble_numbers", ["success"]);

    const { id: serviceId } = data.sendMessage.outboundMessage;
    await r
      .knex("message")
      .update({
        service_id: serviceId,
        send_status: SpokeSendStatus.Sent,
        sent_at: r.knex.fn.now(),
        service_response: JSON.stringify([result])
      })
      .where({ id: spokeMessageId });
  } catch (exc) {
    // TODO - distinguish different failures modes (HTTP failure vs. HTTP 200 with GraphQL errors)
    statsd.increment("send_message.assemble_numbers", ["failure"]);

    logger.error("Error sending message with Assemble Numbers: ", {
      ...errToObj(exc),
      messageInput
    });
    await r
      .knex("message")
      .update({ send_status: SpokeSendStatus.Error })
      .where({ id: spokeMessageId });
  }
};

/**
 * Map an Assemble Numbers event type to a Spoke send status
 * @param {string} assembleNumbersStatus The event type returned by Assemble Numbers
 * @returns {string} Spoke send status
 */
const getMessageStatus = (assembleNumbersStatus: NumbersSendStatus) => {
  switch (assembleNumbersStatus) {
    case NumbersSendStatus.Queued:
      return SpokeSendStatus.Queued;
    case NumbersSendStatus.Sending:
      return SpokeSendStatus.Sending;
    case NumbersSendStatus.Sent:
      return SpokeSendStatus.Sent;
    case NumbersSendStatus.Delivered:
      return SpokeSendStatus.Delivered;
    case NumbersSendStatus.SendingFailed:
    case NumbersSendStatus.DeliveryFailed:
    case NumbersSendStatus.DeliveryUnconfirmed:
      return SpokeSendStatus.Error;
    default:
      throw new Error(
        `Unexpected assemble numbers status ${assembleNumbersStatus}`
      );
  }
};

/**
 * Process an Assemble Numbers delivery report
 * @param {object} reportBody Assemble Numbers delivery report
 */
export const handleDeliveryReport = async (
  reportBody: NumbersDeliveryReportPayload
) =>
  r.knex("log").insert({
    message_sid: reportBody.messageId,
    service_type: MessagingServiceType.AssembleNumbers,
    body: JSON.stringify(reportBody)
  });

export const processDeliveryReportBody = async (
  client: PoolClient,
  reportBody: NumbersDeliveryReportPayload
) => {
  const { eventType, messageId, errorCodes, extra } = reportBody;

  // Update send status if message is not already "complete"
  await client.query(
    `
      update message
      set
        service_response_at = now(),
        send_status = $1,
        error_codes = $2,
        service_response = (coalesce(service_response, '[]')::jsonb || cast($3 as jsonb))::text
      where
        service_id = $4
        and send_status not in ($5, $6)
    `,
    [
      getMessageStatus(eventType),
      errorCodes,
      JSON.stringify([reportBody]),
      messageId,
      SpokeSendStatus.Delivered,
      SpokeSendStatus.Error
    ]
  );

  // Update segment counts
  if (extra) {
    const { num_segments, num_media } = extra;
    const hasNumSegments = typeof num_segments === "number";
    const hasNumMedia = typeof num_media === "number";

    if (hasNumSegments || hasNumMedia) {
      const numSegments = hasNumSegments ? num_segments : null;
      const numMedia = hasNumMedia ? num_media : null;

      await client.query(
        `
          update message
          set
            num_segments = coalesce($1, num_segments),
            num_media = coalesce($2, num_media)
          where
            service_id = $3
            and (
              num_segments is null
              or num_media is null
            )
        `,
        [numSegments, numMedia, messageId]
      );
    }
  }
};

/**
 * Embed warning text for the user into the body of the message when receiving media attachments.
 * @param {string} body The body (text) of the inbound message
 * @param {number} numMedia The number of media attachments
 */
const formatInboundBody = (body: string, numMedia: number) => {
  let text = body.replace(/\0/g, ""); // strip all UTF-8 null characters (0x00)

  if (numMedia > 0) {
    const warningText = `Spoke Message:\n\nThis message contained ${numMedia} multimedia attachment(s) which Spoke does not display.`;
    const padding = text === "" ? "" : "\n\n";
    text = `${text}${padding}${warningText}`;
  }

  return text;
};

export class UnsolicitedAssembleNumbersMessageError extends Error {
  public readonly assembleMessage: NumbersInboundMessagePayload;

  constructor(message: NumbersInboundMessagePayload) {
    super("Unsolicited Assemble Numbers message!");
    this.assembleMessage = message;
  }
}

/**
 * Convert an inbound Assemble Numbers message object to a Spoke message record.
 * @param {object} assembleMessage The Assemble Numbers message object
 * @returns Spoke message object
 */
const convertInboundMessage = async (
  assembleMessage: NumbersInboundMessagePayload
) => {
  const {
    id: serviceId,
    body,
    from,
    to,
    numMedia,
    numSegments,
    profileId
  } = assembleMessage;
  const contactNumber = getFormattedPhoneNumber(from);
  const userNumber = getFormattedPhoneNumber(to);

  const ccInfo = await getCampaignContactAndAssignmentForIncomingMessage({
    service: "assemble-numbers",
    contactNumber,
    messaging_service_sid: profileId
  });

  if (!ccInfo) {
    throw new UnsolicitedAssembleNumbersMessageError(assembleMessage);
  }

  const spokeMessage = {
    campaign_contact_id: ccInfo && ccInfo.campaign_contact_id,
    contact_number: contactNumber,
    user_number: userNumber,
    is_from_contact: true,
    text: formatInboundBody(body, numMedia),
    service_response: JSON.stringify([assembleMessage]).replace(/\0/g, ""),
    service_id: serviceId,
    assignment_id: ccInfo && ccInfo.assignment_id,
    service: "assemble-numbers",
    send_status: SpokeSendStatus.Delivered,
    num_segments: numSegments,
    num_media: numMedia
  };

  return spokeMessage;
};

/**
 * Convert an array of unprocessed message parts to a final Spoke message.
 * @param {object[]} messageParts Records of inbound Assemble Numbers messages
 * @returns Spoke message object
 */
export const convertMessagePartsToMessage = async (messageParts: any[]) =>
  convertInboundMessage(JSON.parse(messageParts[0].service_message));

/**
 * Process an inbound Assemble Numbers message.
 * @param {object} message Inbound Assemble Numbers message object
 */
export const handleIncomingMessage = async (
  message: NumbersInboundMessagePayload
) => {
  if (config.JOBS_SAME_PROCESS) {
    try {
      const inboundMessage = await convertInboundMessage(message);
      await saveNewIncomingMessage(inboundMessage);
    } catch (err) {
      if (err instanceof UnsolicitedAssembleNumbersMessageError) {
        const { assembleMessage } = err;
        await r.knex("unsolicited_message").insert({
          messaging_service_sid: assembleMessage.profileId,
          service_id: assembleMessage.id,
          from_number: assembleMessage.from,
          body: assembleMessage.body,
          num_segments: assembleMessage.numSegments,
          num_media: assembleMessage.numMedia,
          media_urls: assembleMessage.mediaUrls,
          service_response: assembleMessage
        });
      } else {
        logger.error(
          "Encountered error parsing inbound assemble numbers message: ",
          errToObj(err)
        );
      }
    }
  } else {
    const { id: serviceId, from, to } = message;
    const contactNumber = getFormattedPhoneNumber(from);
    const userNumber = getFormattedPhoneNumber(to);

    const pendingMessagePart = {
      service: "assemble-numbers",
      service_id: serviceId,
      parent_id: null,
      service_message: JSON.stringify(message),
      user_number: userNumber,
      contact_number: contactNumber
    };
    await r.knex("pending_message_part").insert(pendingMessagePart);
  }
};

export default {
  sendMessage,
  inboundMessageValidator,
  deliveryReportValidator,
  handleDeliveryReport,
  processDeliveryReportBody,
  handleIncomingMessage,
  convertMessagePartsToMessage
};
