import CircularProgress from "@material-ui/core/CircularProgress";
import InputAdornment from "@material-ui/core/InputAdornment";
import TextField from "@material-ui/core/TextField";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import {
  useGetCampaignAutosendingLimitQuery,
  useUpdateCampaignAutosendingLimitMutation
} from "@spoke/spoke-codegen";
import React, { useCallback, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

export interface AutosendingLimitFieldProps {
  campaignId: string;
}

export const AutosendingLimitField: React.FC<AutosendingLimitFieldProps> = ({
  campaignId
}) => {
  const [inputValue, setInputValue] = useState<string | null>(null);
  const { data, loading } = useGetCampaignAutosendingLimitQuery({
    variables: { campaignId }
  });

  const [
    updateAutosendingLimit,
    { data: mutationData, loading: mutationLoading }
  ] = useUpdateCampaignAutosendingLimitMutation();

  const debouncedUpdate = useDebouncedCallback((limit: number | null) => {
    updateAutosendingLimit({ variables: { campaignId, limit } });
  }, 300);

  const handleOnChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      setInputValue(event.target.value);
      const limitInt = parseInt(event.target.value, 10);
      const limit = Number.isNaN(limitInt) ? null : limitInt;
      debouncedUpdate(limit);
    },
    [debouncedUpdate]
  );

  return (
    <TextField
      type="number"
      value={inputValue ?? data?.campaign?.autosendLimit ?? ""}
      disabled={loading}
      placeholder="n/a"
      style={{ width: "100px" }}
      InputProps={{
        endAdornment: mutationLoading ? (
          <InputAdornment position="end">
            <CircularProgress />
          </InputAdornment>
        ) : mutationData !== undefined ? (
          <InputAdornment position="end">
            <CheckCircleIcon />
          </InputAdornment>
        ) : undefined
      }}
      onChange={handleOnChange}
    />
  );
};

export default AutosendingLimitField;
