import { MjmlColumn, MjmlImage, MjmlSection } from "@faire/mjml-react";
import React from "react";

const Header: React.FC = () => {
  return (
    <MjmlSection fullWidth>
      <MjmlColumn>
        <MjmlImage src="https://i.imgur.com/xxxV8Jo.png" />
      </MjmlColumn>
    </MjmlSection>
  );
};

export default Header;
