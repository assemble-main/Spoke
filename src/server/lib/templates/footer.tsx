import { MjmlColumn, MjmlSection, MjmlText } from "@faire/mjml-react";
import React from "react";

interface FooterProps {
  orgName: string;
  settingsUrl: string;
}

const Footer: React.FC<FooterProps> = ({ orgName, settingsUrl }) => {
  return (
    <MjmlSection fullWidth>
      <MjmlColumn>
        <MjmlText>
          <p>© 2023 Rewired, LLC. All rights reserved.</p>
          <p>
            You are receiving this email because you signed up to text for{" "}
            {orgName}
            .
            <br />
            <a href={settingsUrl}>Update</a> your preferences or unsubscribe{" "}
            <a href={settingsUrl}>here</a>
            .
            <br />
          </p>
          <p>
            Rewired LLC <br />
            41 Flatbush Ave Fl 1, PMB 731 <br />
            Brooklyn, NY 11217 <br />
          </p>
        </MjmlText>
      </MjmlColumn>
    </MjmlSection>
  );
};
export default Footer;
