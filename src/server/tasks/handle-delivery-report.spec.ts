import { runTaskListOnce, WorkerOptions } from "graphile-worker";
import { Pool, PoolClient } from "pg";

import { mockDeliveryReportBody as mockSwitchboardDeliveryReportBody } from "../../../__mocks__/assemble-numbers";
import { mockDeliveryReportBody as mockTwilioDeliveryReportBody } from "../../../__mocks__/twilio";
import {
  createAssignment,
  createCampaign,
  createCampaignContact,
  createMessage,
  createOrganization,
  createTexter
} from "../../../__test__/testbed-preparation/core";
import { config } from "../../config";
import { MessageRecord, MessagingServiceType } from "../api/types";
import { handleDeliveryReport } from "./handle-delivery-report";

describe("handle-delivery-report", () => {
  let pool: Pool;
  let client: PoolClient;
  let workerOptions: WorkerOptions;
  let campaignContactId: number;
  let assignmentId: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: config.TEST_DATABASE_URL });
    workerOptions = { pgPool: pool };
    client = await pool.connect();

    // Set up campaign contact
    const texter = await createTexter(client, {});
    const organization = await createOrganization(client, {});
    const campaign = await createCampaign(client, {
      organizationId: organization.id
    });
    const campaignContact = await createCampaignContact(client, {
      campaignId: campaign.id
    });
    const assignment = await createAssignment(client, {
      campaignId: campaign.id,
      userId: texter.id
    });
    campaignContactId = campaignContact.id;
    assignmentId = assignment.id;
  });

  afterAll(async () => {
    if (client) client.release();
    if (pool) await pool.end();
  });

  it("handles assemble-numbers delivery report", async () => {
    const message = await createMessage(client, {
      assignmentId,
      campaignContactId,
      sendStatus: "SENT"
    });
    const deliveryReport = mockSwitchboardDeliveryReportBody(
      message.service_id
    );

    const getMessage = () =>
      client
        .query<MessageRecord>(`select * from message where id = $1`, [
          message.id
        ])
        .then(({ rows: [messageRecord] }) => messageRecord);

    const preJobMessage = await getMessage();
    expect(preJobMessage.num_segments).toBeNull();
    expect(preJobMessage.num_media).toBeNull();

    await client.query(
      `insert into log (message_sid, body, service_type) values ($1, $2, $3)`,
      [
        message.service_id,
        JSON.stringify(deliveryReport),
        MessagingServiceType.AssembleNumbers
      ]
    );
    await runTaskListOnce(
      workerOptions,
      {
        "handle-delivery-report": handleDeliveryReport
      },
      client
    );

    const postJobMessage = await getMessage();
    const { extra } = deliveryReport;
    expect(postJobMessage.num_segments).not.toBeNull();
    expect(postJobMessage.num_media).not.toBeNull();
    expect(postJobMessage.num_segments).toBe(extra?.num_segments);
    expect(postJobMessage.num_media).toBe(extra?.num_media);
    expect(postJobMessage.send_status).toBe("DELIVERED");
  });

  it("handles twilio delivery report", async () => {
    const message = await createMessage(client, {
      assignmentId,
      campaignContactId,
      sendStatus: "SENT"
    });
    const deliveryReport = mockTwilioDeliveryReportBody(message.service_id);
    await client.query(
      `insert into log (message_sid, body, service_type) values ($1, $2, $3)`,
      [
        message.service_id,
        JSON.stringify(deliveryReport),
        MessagingServiceType.Twilio
      ]
    );
    await runTaskListOnce(
      workerOptions,
      {
        "handle-delivery-report": handleDeliveryReport
      },
      client
    );

    const {
      rows: [messageRecord]
    } = await client.query<MessageRecord>(
      `select * from message where id = $1`,
      [message.id]
    );

    expect(messageRecord.send_status).toBe("DELIVERED");
    // Twilio segment counts are recorded at send-time
    expect(messageRecord.num_segments).toBeNull();
    expect(messageRecord.num_media).toBeNull();
  });
});
