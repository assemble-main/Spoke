import React from "react";
import ReactDOMServer from "react-dom/server";
import assemblePalette from "src/styles/assemble-palette";

import type { CampaignRecord, OrganizationRecord } from "../../api/types";
import { NotificationTypes } from "../../api/types";
import TemplateWrapper from "./template-wrapper";

interface FormattedNotification {
  notificationType: NotificationTypes;
  campaign: CampaignRecord;
  count: number;
}

interface DigestProps {
  organization: OrganizationRecord;
  notifications: FormattedNotification[];
  textingUrl: string;
  settingsUrl: string;
}

interface NotificationContentProps {
  notification: FormattedNotification;
}

const styles = {
  font: {
    fontFamily: "Helvetica"
  },
  button: {
    backgroundColor: assemblePalette.primary.navy,
    padding: `12px 20px`,
    border: "none",
    color: "white",
    borderRadius: 4,
    marginBottom: 10
  }
};

const AssignmentCreatedRow: React.FC<NotificationContentProps> = ({
  notification
}) => {
  return (
    <p>
      [{notification.campaign.title}]: New Assignment. {notification.count}{" "}
      messages to send.
    </p>
  );
};

const AssignmentUpdatedRow: React.FC<NotificationContentProps> = ({
  notification
}) => {
  return (
    <p>
      [{notification.campaign.title}]: Updated Assignment. {notification.count}{" "}
      messages to send.
    </p>
  );
};

const AssignmentMessageReceivedRow: React.FC<NotificationContentProps> = ({
  notification
}) => {
  return (
    <p>
      [{notification.campaign.title}]: Replies Received. {notification.count}{" "}
      new replies.
    </p>
  );
};

const renderDigestRow = (notification: FormattedNotification) => {
  switch (notification.notificationType) {
    case NotificationTypes.AssignmentCreated:
      return <AssignmentCreatedRow notification={notification} />;
    case NotificationTypes.AssignmentUpdated:
      return <AssignmentUpdatedRow notification={notification} />;
    case NotificationTypes.AssignmentMessageReceived:
      return <AssignmentMessageReceivedRow notification={notification} />;
    default:
      return <div />;
  }
};

const Digest: React.FC<DigestProps> = ({
  organization,
  notifications,
  textingUrl,
  settingsUrl
}) => {
  const orgName = organization.name;
  return (
    <TemplateWrapper organizationName={orgName} settingsUrl={settingsUrl}>
      <p>Hello!</p>
      <p>You have outstanding text assignments from {orgName}: </p>
      {notifications.map((notification) => renderDigestRow(notification))}
      <button
        type="button"
        style={styles.button}
        onClick={() => {
          window.open(textingUrl);
        }}
      >
        Send Now
      </button>
      <br />
    </TemplateWrapper>
  );
};

const getDigestContent = async (
  organization: OrganizationRecord,
  notifications: FormattedNotification[],
  textingUrl: string,
  settingsUrl: string
) => {
  const template = (
    <Digest
      organization={organization}
      notifications={notifications}
      textingUrl={textingUrl}
      settingsUrl={settingsUrl}
    />
  );
  const content = ReactDOMServer.renderToStaticMarkup(template);

  return content;
};

export default getDigestContent;
