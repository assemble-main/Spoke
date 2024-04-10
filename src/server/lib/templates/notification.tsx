import { renderToMjml } from "@faire/mjml-react/utils/renderToMjml";
import mjml2html from "mjml";
import React from "react";

import assemblePalette from "../../../styles/assemble-palette";
import type { CampaignRecord, OrganizationRecord } from "../../api/types";
import { NotificationTypes } from "../../api/types";
import TemplateWrapper from "./template-wrapper";

interface NotificationProps {
  campaign: CampaignRecord;
  organization: OrganizationRecord;
  assignmentCount: string;
  settingsUrl: string;
  textingUrl: string;
}

const styles = {
  font: {
    fontFamily: "Helvetica"
  },
  button: {
    width: 80,
    backgroundColor: assemblePalette.primary.navy,
    padding: `12px 20px`,
    borderRadius: 4,
    cursor: "pointer",
    marginBottom: 10
  },
  buttonText: {
    color: "white",
    textDecoration: "none"
  }
};

const AssignmentCreated: React.FC<NotificationProps> = ({
  organization,
  campaign,
  assignmentCount,
  textingUrl,
  settingsUrl
}) => {
  const orgName = organization.name;
  return (
    <TemplateWrapper organizationName={orgName} settingsUrl={settingsUrl}>
      <p>Hello!</p>
      <p>
        You just got a new texting assignment from {orgName}: {campaign.title}.
      </p>
      <p>There are {assignmentCount} first message(s) to send.</p>
      <div style={styles.button}>
        <a style={styles.buttonText} href={textingUrl}>
          Send Now
        </a>
      </div>
      <br />
    </TemplateWrapper>
  );
};

const AssignmentUpdated: React.FC<NotificationProps> = ({
  organization,
  campaign,
  assignmentCount,
  textingUrl,
  settingsUrl
}) => {
  const orgName = organization.name;
  return (
    <TemplateWrapper organizationName={orgName} settingsUrl={settingsUrl}>
      <p>Hello!</p>
      <p>
        Your texting assignment from {orgName}: {campaign.title} has been
        updated.
      </p>
      <p>
        {assignmentCount === "1"
          ? `There is one message to send. `
          : `There are ${assignmentCount} messages to send. `}
      </p>
      <div style={styles.button}>
        <a style={styles.buttonText} href={textingUrl}>
          Send Now
        </a>
      </div>
      <br />
    </TemplateWrapper>
  );
};

const AssignmentMessageReceived: React.FC<NotificationProps> = ({
  organization,
  campaign,
  textingUrl,
  settingsUrl
}) => {
  const orgName = organization.name;
  return (
    <TemplateWrapper organizationName={orgName} settingsUrl={settingsUrl}>
      <p>Hello!</p>
      <p>
        Someone responded to your message from {orgName} in {campaign.title}.
        Check out your pending texts!
      </p>
      <div style={styles.button}>
        <a style={styles.buttonText} href={textingUrl}>
          Send Now
        </a>
      </div>
      <br />
    </TemplateWrapper>
  );
};

const getNotificationContent = (
  data: NotificationProps,
  notificationType: NotificationTypes
) => {
  let template = null;
  let subject = "";

  const { organization, campaign } = data;
  switch (notificationType) {
    case NotificationTypes.AssignmentCreated:
      template = <AssignmentCreated {...data} />;
      subject = `[${organization.name}] New Assignment: ${campaign.title}`;
      break;
    case NotificationTypes.AssignmentUpdated:
      template = <AssignmentUpdated {...data} />;
      subject = `[${organization.name}] Updated Assignment: ${campaign.title}`;
      break;
    case NotificationTypes.AssignmentMessageReceived:
      template = <AssignmentMessageReceived {...data} />;
      subject = `[${organization.name}] New Reply: ${campaign.title}`;
      break;
    default:
      throw new Error(`Unrecognized notification type ${notificationType}`);
  }

  const content = mjml2html(renderToMjml(template)).html;

  return {
    content,
    subject
  };
};

export default getNotificationContent;
