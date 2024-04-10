/* eslint-disable import/prefer-default-export */
import type { Notice } from "@spoke/spoke-codegen";

import {
  isPending10DlcCampaignNotice,
  isPricing10DlcNotice,
  isPricingTollFreeNotice,
  isRegister10DlcBrandNotice,
  isRegister10DlcCampaignNotice,
  isTitleContentNotice
} from "../../api/notice";

// explicitly setting typename
export const resolvers = {
  Notice: {
    __resolveType(obj: Notice) {
      if (isTitleContentNotice(obj)) {
        return "TitleContentNotice";
      }
      if (isRegister10DlcBrandNotice(obj)) {
        return "Register10DlcBrandNotice";
      }
      if (isRegister10DlcCampaignNotice(obj)) {
        return "Register10DlcCampaignNotice";
      }
      if (isPending10DlcCampaignNotice(obj)) {
        return "Pending10DlcCampaignNotice";
      }
      if (isPricing10DlcNotice(obj)) {
        return "Pricing10DlcNotice";
      }
      if (isPricingTollFreeNotice(obj)) {
        return "PricingTollFreeNotice";
      }
      return null;
    }
  }
};
