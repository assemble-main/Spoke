import React from "react";

import KnowledgeBase10DlcNoticeText from "./KnowledgeBaseText";

const CampaignRegistration10DlcNoticeText: React.FC = () => (
  <>
    <p>
      <strong>
        You have started but not yet completed your 10DLC registration form.
      </strong>
    </p>
    <p>
      You must complete registration in order to gain access to our{" "}
      <a
        href="https://www.politicsrewired.com/pricing"
        target="_blank"
        rel="noreferrer"
      >
        Standard pricing plan
      </a>
      . Please complete the second section of our 10DLC form to finalize your
      registration.
    </p>
    <p>
      You are currently on our{" "}
      <a
        href="https://www.politicsrewired.com/pricing"
        target="_blank"
        rel="noreferrer"
      >
        Quick Start pricing plan
      </a>
      . You may send messages without registering for 10DLC at an increased
      price per message segment.
    </p>
    <KnowledgeBase10DlcNoticeText />
  </>
);

export default CampaignRegistration10DlcNoticeText;
