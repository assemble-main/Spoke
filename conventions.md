# Conventions

This document includes codebase contentions and style guidelines for Spoke, especially those that are not captured by prettier nor eslint.

## Components

1. Component Props
   a. Props interface naming should follow this convention: `[ComponentName]Props`.
   b. Type definition for component props should be exported.

2. Variable Names
   a. Use affirmative variables for component behavior, i.e. `showWarning` rather than `hideWarning`.

3. Do not render unnecessary `div`s as they make it slower for the browser to render the page. When needed, return `null` instead of an empty `div`.

4. Use `graphql-codegen` and import GraphQL types from `@spoke/spoke-codegen` when appropriate.

5. When working with old class type components, which might be bad candidates for immediate refactoring, refactor the GraphQL queries to import `QueryDocument` from `@spoke/spoke-codegen`.

## Style

1. Constrain inline CSS to a single style at most. If more than that, use a `makeStyle` hook.

2. Use `theme.palette` colors over direct definitions of colors. If a direct definition is required, import and use the color from `@material-ui/core/colors`.

## Error handling

1. GraphQL Errors
   a. If data is erroneouly fetched for display, render an inline list of errors using a MUI <Alert> component.
   b. If the operation eliciting an error is performed from a button, render a modal with an error.
   c. If the operation eliciting an error is performed within a modal, render an inline error at the top of the modal.
