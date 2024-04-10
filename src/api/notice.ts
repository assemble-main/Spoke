import type {
  Notice,
  Pending10DlcCampaignNotice,
  Pricing10DlcNotice,
  PricingTollFreeNotice,
  Register10DlcBrandNotice,
  Register10DlcCampaignNotice,
  TitleContentNotice
} from "@spoke/spoke-codegen";
import type { GraphQLType } from "graphql";

export function isTitleContentNotice(obj: Notice): obj is TitleContentNotice {
  return (
    (obj as TitleContentNotice & GraphQLType).__typename ===
    "TitleContentNotice"
  );
}

export function isRegister10DlcBrandNotice(
  obj: Notice
): obj is Register10DlcBrandNotice {
  return (
    (obj as Register10DlcBrandNotice & GraphQLType).__typename ===
    "Register10DlcBrandNotice"
  );
}

export function isRegister10DlcCampaignNotice(
  obj: Notice
): obj is Register10DlcCampaignNotice {
  return (
    (obj as Register10DlcCampaignNotice & GraphQLType).__typename ===
    "Register10DlcCampaignNotice"
  );
}

export function isPending10DlcCampaignNotice(
  obj: Notice
): obj is Pending10DlcCampaignNotice {
  return (
    (obj as Pending10DlcCampaignNotice & GraphQLType).__typename ===
    "Pending10DlcCampaignNotice"
  );
}

export function isPricing10DlcNotice(obj: Notice): obj is Pricing10DlcNotice {
  return (
    (obj as Pricing10DlcNotice & GraphQLType).__typename ===
    "Pricing10DlcNotice"
  );
}

export function isPricingTollFreeNotice(
  obj: Notice
): obj is PricingTollFreeNotice {
  return (
    (obj as PricingTollFreeNotice & GraphQLType).__typename ===
    "PricingTollFreeNotice"
  );
}
