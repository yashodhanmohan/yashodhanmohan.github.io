import React from "react";
import PropTypes from "prop-types";
import { withStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import Divider from "@material-ui/core/Divider";
import Grid from "@material-ui/core/Grid";

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

type CaesarCipherEncryptorState = {
    input: string,
    key: number
}

type CaesarCipherEncryptorProps = {
    classes: any
}

class CaesarCipherEncryptor extends React.Component<CaesarCipherEncryptorProps, CaesarCipherEncryptorState> {

    static propTypes = {
        classes: PropTypes.object.isRequired
    };    
    
    constructor(props: CaesarCipherEncryptorProps) {
        super(props);
        this.state = {
            input: "",
            key: 0
        };
    }

    mod = (input, base) => {
        input = Number(input);
        if (input < 0) {
            input = input + (Math.floor((-input) / base) * base) + base;
        }
        return (input % base);
    }

    decryptionKey = (encryptionKey) => {
        return (26 - this.mod(encryptionKey, 26));
    }

    encrypt = () => {
        const {input, key} = this.state;
        let output = "";
        const easyKey = key % 26,
            A = "A".charCodeAt(0),
            a = "a".charCodeAt(0);
        for (let i = 0; i < input.length; i++) {
            const original = input.charAt(i),
                originalAscii = input.charAt(i).charCodeAt(0);
            if (original >= "A" && original <= "Z") {
                output += String.fromCharCode(
                    this.mod(originalAscii - A + easyKey, 26) + A
                );
            } else if (original >= "a" && original <= "z") {
                output += String.fromCharCode(
                    this.mod(originalAscii - a + easyKey, 26) + a
                );
            } else {
                output += original;
            }
        }
        return output;
    }

    handleInputChange = (event) => {
        this.setState({ input: event.target.value });
    }

    handleKeyChange = (event) => {
        this.setState({ key: Number(event.target.value) });
    }

    render() {
        const { classes } = this.props;
        return (
            <div className={classes.root}>
                <Paper className={classes.inputOutput} square>
                    <div className={classes.heading}>
                        <Typography variant="h4" color="primary">
                            Caesar Cipher
                        </Typography>
                    </div>
                    <Divider />
                    <div className={classes.inputContainer}>
                        <Typography variant="h5" color="primary">
                            Input
                        </Typography>
                        <Grid container spacing={8}>
                            <Grid item xs={8}>
                                <TextField
                                    multiline
                                    autoFocus
                                    fullWidth
                                    label="Enter your text here"
                                    rowsMax="10"
                                    rows="2"
                                    value={this.state.input}
                                    onChange={this.handleInputChange}
                                    margin="normal"
                                    variant="outlined"
                                />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField
                                    id="caesar-encryptor-key"
                                    label="Encryption Key"
                                    value={this.state.key}
                                    onChange={this.handleKeyChange}
                                    type="number"
                                    InputLabelProps={{
                                        shrink: true
                                    }}
                                    margin="normal"
                                    variant="outlined"
                                />
                            </Grid>
                        </Grid>
                    </div>
                    <Divider />
                    <Divider />
                    <div className={classes.outputContainer}>
                        <Typography variant="h5" color="primary">
                            Output (decryption key: {this.decryptionKey(this.state.key)})
                        </Typography>
                        <TextField
                            disabled
                            multiline
                            fullWidth
                            rowsMax="10"
                            rows="2"
                            value={this.encrypt()}
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

export default withStyles(styles, { withTheme: true })(CaesarCipherEncryptor);
