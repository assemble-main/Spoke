import { css, StyleSheet } from "aphrodite";
import PropTypes from "prop-types";
import React from "react";
import Form from "react-formal";

import theme from "../../styles/theme";
import GSSubmitButton from "./GSSubmitButton";
import SpokeFormField from "./SpokeFormField";

const styles = StyleSheet.create({
  errorMessage: {
    color: theme.colors.red,
    marginRight: "auto",
    marginLeft: "auto",
    textAlign: "center"
  }
});
export default class GSForm extends React.Component {
  // eslint-disable-next-line react/static-property-placement
  static propTypes = {
    value: PropTypes.object,
    defaultValue: PropTypes.object,
    onChange: PropTypes.func,
    children: PropTypes.array
  };

  state = {
    formErrors: null,
    isSubmitting: false,
    model: null,
    globalErrorMessage: null
  };

  // to display title and script as default values in CannedResponseEditor,
  // state.model must be mapped to children.props.values on mount
  UNSAFE_componentWillMount() {
    const { children } = this.props;

    if (Array.isArray(children)) {
      let model = null;
      children.map((child) => {
        if (child) {
          const { context, value, name } = child.props;
          if (context === "responseEditor" && value) {
            model = { ...model, [name]: value };
          }
        }
        return model;
      });
      this.setState({ model });
    }
  }

  submit = () => {
    if (this.formRef) {
      this.formRef.submit();
    }
  };

  handleFormRefChange = (ref) => {
    this.formRef = ref;
  };

  handleSubmitForm = async (formValues) => {
    this.setState({
      isSubmitting: true,
      globalErrorMessage: null
    });
    if (this.props.onSubmit) {
      try {
        await this.props.onSubmit(formValues);
      } catch (err) {
        this.handleFormSubmitError(err);
      }
    }
    this.setState({ isSubmitting: false });
  };

  handleOnFormChange = (model) => {
    this.setState({ model });
    if (this.props.onChange) {
      this.props.onChange(model);
    }
  };

  handleFormError = (errors) => this.setState({ formErrors: errors });

  handleFormSubmitError = (err) => {
    if (err.message) {
      this.setState({ globalErrorMessage: err.message });
    } else {
      console.error(err);
      this.setState({
        globalErrorMessage:
          "Oops! Your form submission did not work. Contact your administrator."
      });
    }
  };

  renderChildren = (children) => {
    return React.Children.map(children, (child) => {
      if (!React.isValidElement(child)) {
        return child;
      }
      if (child.type === Form.Field || child.type === SpokeFormField) {
        const { name } = child.props;
        let error = this.state.formErrors ? this.state.formErrors[name] : null;
        let clonedElement = child;
        if (error) {
          error = error[0]
            ? error[0].message.replace(name, child.props.label)
            : null;
          clonedElement = React.cloneElement(child, {
            errorText: error
          });
        }
        return React.cloneElement(clonedElement, {
          events: ["onBlur"]
        });
      }
      if (child.type === Form.Submit) {
        return React.cloneElement(child, {
          as: GSSubmitButton,
          isSubmitting: this.state.isSubmitting
        });
      }
      if (child.props && child.props.children) {
        return React.cloneElement(child, {
          children: this.renderChildren(child.props.children)
        });
      }
      return child;
    });
  };

  renderGlobalErrorMessage = () => {
    if (!this.state.globalErrorMessage) {
      return "";
    }

    return (
      <div className={css(styles.errorMessage)}>
        {this.state.globalErrorMessage}
      </div>
    );
  };

  render() {
    const value =
      this.props.value || this.state.model || this.props.defaultValue;
    return (
      <Form
        ref={this.handleFormRefChange}
        value={value}
        {...this.props}
        onChange={this.handleOnFormChange}
        onError={this.handleFormError}
        onSubmit={this.handleSubmitForm}
      >
        {this.renderGlobalErrorMessage()}
        {this.renderChildren(this.props.children)}
      </Form>
    );
  }
}

GSForm.propTypes = {
  onSubmit: PropTypes.func
};
