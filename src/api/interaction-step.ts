import type { Question } from "./question";
import type { QuestionResponse } from "./question-response";

export interface InteractionStep {
  id: string;
  question?: Question;
  questionText: string;
  scriptOptions: string[];
  answerOption: string;
  parentInteractionId?: string | null;
  isDeleted: boolean;
  answerActions: string;
  questionResponse?: QuestionResponse;
  createdAt: string;
}

export interface InteractionStepInput {
  id: string | null;
  questionText: string | null;
  scriptOptions: string[];
  answerOption: string | null;
  answerActions: string | null;
  parentInteractionId: string | null;
  isDeleted: boolean;
  createdAt: string;
}

export interface InteractionStepWithChildren extends InteractionStepInput {
  interactionSteps: InteractionStepWithChildren[] | null;
}

export const schema = `
  type InteractionStep {
    id: ID!
    question: Question
    questionText: String
    scriptOptions: [String]!
    answerOption: String
    parentInteractionId: String
    isDeleted: Boolean
    answerActions: String
    questionResponse(campaignContactId: String): QuestionResponse
    createdAt: Date!
  }

  input InteractionStepInput {
    id: String
    questionText: String
    scriptOptions: [String]!
    answerOption: String
    answerActions: String
    parentInteractionId: String
    isDeleted: Boolean
    createdAt: Date
    interactionSteps: [InteractionStepInput]
  }
`;
