import PropTypes from "prop-types";
import React from "react";

import { getSpokeCharCount } from "../lib/charset-utils";

const MessageLengthInfo: React.SFC<{ messageText: string }> = ({
  messageText
}) => {
  const { charCount, msgCount, charsPerSegment } = getSpokeCharCount(
    messageText
  );
  const segmentInfo = msgCount === 1 ? "(1 segment)" : `(${msgCount} segments)`;

  return (
    <div style={{ display: "inline" }}>
      {`${charCount}/${msgCount * charsPerSegment} ${segmentInfo}`}
    </div>
  );
};

MessageLengthInfo.propTypes = {
  messageText: PropTypes.string.isRequired
};

export default MessageLengthInfo;
