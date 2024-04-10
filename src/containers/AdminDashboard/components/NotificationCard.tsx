import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import Divider from "@material-ui/core/Divider";
import { useGetOrganizationNotificationsQuery } from "@spoke/spoke-codegen";
import React from "react";

import {
  isPending10DlcCampaignNotice,
  isPricing10DlcNotice,
  isPricingTollFreeNotice,
  isRegister10DlcBrandNotice,
  isRegister10DlcCampaignNotice,
  isTitleContentNotice
} from "../../../api/notice";
import Pending10DlcCampaignNoticeCard from "./Pending10DlcCampaignNoticeCard";
import PricingNoticeCard from "./PricingNoticeCard";
import Register10DlcNoticeCard from "./Register10DlcNoticeCard";
import TitleContentNoticeCard from "./TitleContentNoticeCard";

interface NotificationCardProps {
  organizationId: string;
}

export const NotificationCard: React.FC<NotificationCardProps> = ({
  organizationId
}) => {
  const { data, loading, error } = useGetOrganizationNotificationsQuery({
    variables: { organizationId }
  });

  if (loading) return null;

  if (error || !data?.notices) {
    return (
      <Card style={{ marginBottom: "2em" }}>
        <CardContent>There was an error fetching notifications.</CardContent>
      </Card>
    );
  }

  return (
    <div>
      {data?.notices.edges.map(({ node }) => {
        if (isTitleContentNotice(node)) {
          return (
            <TitleContentNoticeCard
              key={node.id}
              title={node.title}
              avatarIcon={node.avatarIcon}
              avatarColor={node.avatarColor as any}
              markdownContent={node.markdownContent}
            />
          );
        }
        if (window.SHOW_10DLC_REGISTRATION_NOTICES) {
          if (
            isRegister10DlcBrandNotice(node) ||
            isRegister10DlcCampaignNotice(node)
          ) {
            return <Register10DlcNoticeCard key={node.id} {...node} />;
          }
          if (isPending10DlcCampaignNotice(node)) {
            return <Pending10DlcCampaignNoticeCard key={node.id} {...node} />;
          }
          if (isPricing10DlcNotice(node) || isPricingTollFreeNotice(node)) {
            return <PricingNoticeCard key={node.id} {...node} />;
          }
        }
        return null;
      })}
      {data?.notices.pageInfo.totalCount > 0 && <Divider />}
    </div>
  );
};

export default NotificationCard;
