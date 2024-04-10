import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import CardHeader from "@material-ui/core/CardHeader";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Switch from "@material-ui/core/Switch";
import TextField from "@material-ui/core/TextField";
import Alert from "@material-ui/lab/Alert";
import {
  useGetMessageSendingSettingsQuery,
  useUpdateMessageSendingSettingsMutation
} from "@spoke/spoke-codegen";
import React from "react";

export interface MessageSendingSettingsCardProps {
  organizationId: string;
  style?: React.CSSProperties;
}

// eslint-disable-next-line max-len
export const MessageSendingSettingsCard: React.FC<MessageSendingSettingsCardProps> = (
  props
) => {
  const { organizationId, style } = props;

  const getSettingsState = useGetMessageSendingSettingsQuery({
    variables: { organizationId }
  });
  const settings = getSettingsState?.data?.organization?.settings;

  const [
    setMaxSmsSegmentLength,
    updateState
  ] = useUpdateMessageSendingSettingsMutation();

  const working = getSettingsState.loading || updateState.loading;
  const errorMsg =
    getSettingsState.error?.message ?? updateState.error?.message;

  const maxSmsSegmentLength = settings?.maxSmsSegmentLength;
  const showMaxSmsSegmentLength = maxSmsSegmentLength !== null;

  const setNewMaxSmsSegmentLength = async (
    newMax: number | null | undefined
  ) => {
    await setMaxSmsSegmentLength({
      variables: {
        organizationId,
        maxSmsSegmentLength: newMax
      }
    });
  };

  // eslint-disable-next-line max-len
  const handleChangeMaxSmsSegmentLength: React.ChangeEventHandler<HTMLInputElement> = async (
    event
  ) => {
    if (working) return;
    const newMax = event.target.valueAsNumber;
    await setNewMaxSmsSegmentLength(newMax);
  };

  // eslint-disable-next-line max-len
  const handleToggleMmsConversion: React.ChangeEventHandler<HTMLInputElement> = async (
    event
  ) => {
    const { checked } = event.target;
    const DEFAULT_MAX_SMS_SEGMENT_LENGTH = 3;
    const newMax = checked ? DEFAULT_MAX_SMS_SEGMENT_LENGTH : null;
    await setNewMaxSmsSegmentLength(newMax);
  };

  return (
    <Card style={style}>
      <CardHeader title="Message Sending Settings" disableTypography />
      <CardContent>
        {errorMsg && <Alert severity="error">Error: {errorMsg}</Alert>}
        <p>
          Turn on this feature to automatically convert long SMS messages to
          MMS. If turned on, SMS messages <i>longer</i> than the length you set
          will be converted. For example, if you set the max length to 3, a 4
          segment SMS message will be converted to MMS.
        </p>
        <p style={{ marginBottom: 25 }}>
          Messages longer than 3 segments are usually cheaper to send as MMS.
          You may notice changes in deliverability when switching from SMS to
          MMS messages.{" "}
          <a
            href="https://docs.spokerewired.com/article/86-include-an-image-in-a-message"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more about sending MMS here
          </a>
        </p>
        <FormControlLabel
          label="Convert long SMS messages to MMS?"
          control={
            <Switch
              checked={showMaxSmsSegmentLength}
              onChange={handleToggleMmsConversion}
            />
          }
        />
        {showMaxSmsSegmentLength && (
          <TextField
            label="Max SMS Segment Length"
            type="number"
            value={settings?.maxSmsSegmentLength}
            onChange={handleChangeMaxSmsSegmentLength}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default MessageSendingSettingsCard;
