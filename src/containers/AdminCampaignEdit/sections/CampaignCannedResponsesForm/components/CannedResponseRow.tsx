import IconButton from "@material-ui/core/IconButton";
import CreateIcon from "@material-ui/icons/Create";
import DeleteIcon from "@material-ui/icons/Delete";
import type { CampaignVariable, CannedResponse } from "@spoke/spoke-codegen";
import React from "react";

import { LargeListItem } from "../../../../../components/LargeList";
import { tokensToElems } from "../../../../../components/ScriptOptionBlock";
import { dataTest } from "../../../../../lib/attributes";
import { scriptToTokens } from "../../../../../lib/scripts";

interface Props {
  cannedResponse: CannedResponse;
  customFields: string[];
  campaignVariables: Omit<CampaignVariable, "createdAt" | "updatedAt">[];
  onDelete(): void;
  onToggleResponseEditor(): void;
}

export const CannedResponseRow: React.FC<Props> = ({
  cannedResponse,
  campaignVariables,
  customFields,
  onDelete,
  onToggleResponseEditor
}) => {
  const actionMenu = (
    <div>
      <IconButton onClick={onToggleResponseEditor}>
        <CreateIcon />
      </IconButton>
      <IconButton onClick={onDelete}>
        <DeleteIcon />
      </IconButton>
    </div>
  );

  const { tokens } = scriptToTokens({
    script: cannedResponse.text,
    customFields,
    campaignVariables,
    hydrate: true
  });

  const elems = tokensToElems(tokens);

  return (
    <LargeListItem
      {...dataTest("cannedResponse")}
      draggable
      key={cannedResponse.id}
      primaryText={cannedResponse.title}
      secondaryText={elems}
      rightActionMenu={actionMenu}
    />
  );
};

export default CannedResponseRow;
