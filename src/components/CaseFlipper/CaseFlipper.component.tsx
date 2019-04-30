import { withStyles } from "@material-ui/core/styles";
import Divider from "@material-ui/core/Divider";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import FormGroup from "@material-ui/core/FormGroup";
import Paper from "@material-ui/core/Paper";
import PropTypes from "prop-types";
import Radio from "@material-ui/core/Radio";
import React from "react";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";

const styles = {
    root: {},
    inputOutput: {
        padding: 10
    },
    inputContainer: {
        marginTop: 10
    },
    outputContainer: {
        marginTop: 10
    },
    caseChangeLabel: {
        marginRight: 10,
        marginTop: 50
    },
    caseChangeGroup: {
        justifyContent: "center"
    },
    heading: {
        marginBottom: 10
    }
};

enum CASE_OPTIONS {
    UPPERCASE,
    LOWERCASE,
    FLIP,
    REVERSE
};

type CaseFlipperState = {
    input: string,
    caseChangeOption: CASE_OPTIONS
}

type CaseFlipperProps = {
    classes: any
}

class CaseFlipper extends React.Component<CaseFlipperProps, CaseFlipperState> {

    static propTypes = {
        classes: PropTypes.object.isRequired
    };

    constructor(props: CaseFlipperProps) {
        super(props);
        this.state = {
            input: "",
            caseChangeOption: CASE_OPTIONS.UPPERCASE
        };
    }

    convertCase = () => {
        const { input, caseChangeOption } = this.state;
        let output = "";
        if (caseChangeOption == CASE_OPTIONS.UPPERCASE) {
            output = input.toUpperCase();
        } else if (caseChangeOption == CASE_OPTIONS.LOWERCASE) {
            output = input.toLowerCase();
        } else if (caseChangeOption == CASE_OPTIONS.FLIP) {
            for (let i = 0; i < input.length; i++) {
                if (input.charAt(i) >= "a" && input.charAt(i) <= "z") {
                    output += input.charAt(i).toUpperCase();
                } else if (input.charAt(i) >= "A" && input.charAt(i) <= "Z") {
                    output += input.charAt(i).toLowerCase();
                } else {
                    output += input.charAt(i);
                }
            }
        } else if (caseChangeOption == CASE_OPTIONS.REVERSE) {
            for (let i = input.length - 1; i >= 0; i--) {
                output += input.charAt(i);
            }
        }
        return output;
    }

    handleInputChange = (event) => {
        this.setState({ input: event.target.value });
    }

    handleCaseChangeOption = (event) => {
        this.setState({ caseChangeOption: Number(event.target.value) });
    }

    render() {
        const { classes } = this.props;
        return (
            <div className={classes.root}>
                <Paper className={classes.inputOutput} square>
                    <div className={classes.heading}>
                        <Typography variant="h4" color="primary">Case Converter</Typography>
                    </div>
                    <Divider />
                    <div className={classes.inputContainer}>
                        <Typography variant="h5" color="primary">Input</Typography>
                        <TextField
                            multiline
                            fullWidth
                            autoFocus
                            label="Enter your text here"
                            rowsMax="10"
                            rows="2"
                            value={this.state.input}
                            onChange={this.handleInputChange}
                            margin="normal"
                            variant="outlined"
                        />
                    </div>
                    <Divider />
                    <FormGroup row classes={{ row: classes.caseChangeGroup }}>
                        <FormControlLabel
                            control={
                                <Radio
                                    checked={this.state.caseChangeOption === CASE_OPTIONS.LOWERCASE}
                                    onChange={this.handleCaseChangeOption}
                                    value={CASE_OPTIONS.LOWERCASE}
                                    name="caseChangeOption"
                                    aria-label="To lowercase"
                                />
                            }
                            label="Lowercase"
                        />
                        <FormControlLabel
                            control={
                                <Radio
                                    checked={this.state.caseChangeOption === CASE_OPTIONS.UPPERCASE}
                                    onChange={this.handleCaseChangeOption}
                                    value={CASE_OPTIONS.UPPERCASE}
                                    name="caseChangeOption"
                                    aria-label="To uppercase"
                                />
                            }
                            label="Uppercase"
                        />

                        <FormControlLabel
                            control={
                                <Radio
                                    checked={this.state.caseChangeOption === CASE_OPTIONS.FLIP}
                                    onChange={this.handleCaseChangeOption}
                                    value={CASE_OPTIONS.FLIP}
                                    name="caseChangeOption"
                                    aria-label="Flip the case"
                                />
                            }
                            label="Flip"
                        />
                        <FormControlLabel
                            control={
                                <Radio
                                    checked={this.state.caseChangeOption === CASE_OPTIONS.REVERSE}
                                    onChange={this.handleCaseChangeOption}
                                    value={CASE_OPTIONS.REVERSE}
                                    name="caseChangeOption"
                                    aria-label="Reverse the string"
                                />
                            }
                            label="Reverse"
                        />
                    </FormGroup>
                    <Divider />
                    <div className={classes.outputContainer}>
                        <Typography variant="h5" color="primary">Output</Typography>
                        <TextField
                            disabled
                            multiline
                            fullWidth
                            rowsMax="10"
                            rows="2"
                            value={this.convertCase()}
                            margin="normal"
                            variant="filled"
                            label="The output is:"
                        />
                    </div>
                </Paper>
            </div>
        );
    }
}

export default withStyles(styles, { withTheme: true })(CaseFlipper);
