import {
  Mjml,
  MjmlAll,
  MjmlAttributes,
  MjmlBody,
  MjmlColumn,
  MjmlHead,
  MjmlSection,
  MjmlText
} from "@faire/mjml-react";
import React from "react";

import Footer from "./footer";
import Header from "./header";

export interface TemplateWrapperProps {
  children: React.ReactNode;
  organizationName: string;
  settingsUrl: string;
}

export const TemplateWrapper: React.FC<TemplateWrapperProps> = ({
  children,
  organizationName,
  settingsUrl
}) => {
  return (
    <Mjml>
      <MjmlHead>
        <MjmlAttributes>
          <MjmlAll fontFamily="Helvetica, Arial, sans-serif" />
          <MjmlText
            fontWeight="400"
            fontSize="16px"
            color="#000000"
            lineHeight="24px"
          />
        </MjmlAttributes>
      </MjmlHead>
      <MjmlBody>
        <Header />
        <MjmlSection fullWidth backgroundColor="#f3f3f3">
          <MjmlColumn>
            <MjmlText>{children}</MjmlText>
          </MjmlColumn>
        </MjmlSection>
        <Footer orgName={organizationName} settingsUrl={settingsUrl} />
      </MjmlBody>
    </Mjml>
  );
};

export default TemplateWrapper;
