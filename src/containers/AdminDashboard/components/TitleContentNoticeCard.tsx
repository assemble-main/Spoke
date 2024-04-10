import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import CardHeader from "@material-ui/core/CardHeader";
import Announcement from "@material-ui/icons/Announcement";
import React from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

type TitleContentNoticeCardProps = {
  title: string;
  avatarIcon: string;
  avatarColor:
    | "error"
    | "inherit"
    | "disabled"
    | "action"
    | "primary"
    | "secondary"
    | undefined;
  markdownContent: string;
};

// Force links to open in a new window/tab
const components: Components = {
  a: ({ node: _node, children, href, title, ...props }) => (
    <a href={href} title={title} rel="noreferrer" target="_blank" {...props}>
      {children}
    </a>
  )
};

const TitleContentNoticeCard: React.FC<TitleContentNoticeCardProps> = (
  props
) => {
  const avatar =
    props.avatarIcon === "announcement" ? (
      <Announcement color={props.avatarColor} />
    ) : null;

  return (
    <Card variant="outlined" style={{ marginBottom: "2em" }}>
      <CardHeader title={props.title} avatar={avatar} />
      <CardContent>
        <ReactMarkdown components={components}>
          {props.markdownContent}
        </ReactMarkdown>
      </CardContent>
    </Card>
  );
};

export default TitleContentNoticeCard;
