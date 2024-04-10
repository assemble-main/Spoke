import type { TitleContentNotice } from "@spoke/spoke-codegen";

const shutdownNoticeContent = `Politics Rewired is winding down operations. Text messages will no longer be deliverable after **November 15, 2023** and your instance will no longer be available after **November 22, 2023**. Please find more details in our transition document here: [politicsrewired.com](https://www.politicsrewired.com)

Thank you for choosing us for your texting outreach, and we wish you the best of luck with all of your future organizing work ❤️`;

export const SpokeRewiredShutdownNotice: TitleContentNotice = {
  __typename: "TitleContentNotice",
  id: "shutdown-notice",
  title: "Spoke Rewired Shutdown",
  avatarIcon: "announcement",
  avatarColor: "error",
  markdownContent: shutdownNoticeContent
};

export default SpokeRewiredShutdownNotice;
