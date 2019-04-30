import React, { SyntheticEvent } from "react";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Divider from "@material-ui/core/Divider";
import Button from "@material-ui/core/Button";
import { withStyles } from "@material-ui/core/styles";
import { saveAs } from "file-saver";

import JSZip from "jszip";

import FileBox from "./FileBox.component";

const styles = {
    heading: {
        marginBottom: 10
    },
    inputOutput: {
        padding: 10
    },
    fileInput: {
        alignItems: "stretch",
        textAlign: "center",
        marginTop: 10
    },
    compressButton: {
        marginTop: 10
    }
}

type CompressorState = {
    files: File[]
}

type CompressorProps = {
    classes: any,
    theme: any
}

class Compressor extends React.Component<CompressorProps, CompressorState> {

    constructor(props: CompressorProps) {
        super(props);
        this.state = {
            files: []
        }
    }

    preventDefault = (event: React.DragEvent) => {
        event.stopPropagation();
        event.preventDefault();
    }

    handleFileDrop = (event: React.DragEvent) => {
        this.preventDefault(event);
        const droppedFiles: FileList = event.dataTransfer.files;
        let newFiles = [...this.state.files];
        for (let i = 0; i < droppedFiles.length; i++) {
            newFiles.push(droppedFiles.item(i));
        }
        this.setState({ files: newFiles });
    }

    handleFileDelete = (index: number) => {
        let files = this.state.files;
        files.splice(index, 1);
        this.setState({ files: files });
    }

    compress = () => {
        let zip = new JSZip();
        let readCount = 0;
        this.state.files.forEach(file => {
            const fileReader: FileReader = new FileReader();
            fileReader.onload = (event: ProgressEvent) => {
                zip.file(file.name, event.target.result);
                readCount += 1;
                if(readCount==this.state.files.length) {
                    zip.generateAsync(
                        {
                            type: "blob",
                            compression: "DEFLATE",
                            compressionOptions: {
                                level: 9
                            }
                        }
                    ).then((blob) => {
                        saveAs(blob, "download.zip");
                    }, (err) => {
                    });
                }
            }
            fileReader.readAsBinaryString(file);
        });
        
    }

    render() {
        const { classes, theme } = this.props;

        return (
            <div >
                <Paper className={classes.inputOutput} square>
                    <div className={classes.heading}>
                        <Typography variant="h4" color="primary">ZIP Compressor</Typography>
                    </div>
                    <Divider />
                    <Paper
                        className={classes.fileInput}
                        onDrop={this.handleFileDrop}
                        onDragEnter={this.preventDefault}
                        onDragLeave={this.preventDefault}
                        onDragOver={this.preventDefault}
                        style={{
                            color: theme.palette.primary.contrastText,
                            backgroundColor: theme.palette.primary.light,
                            fontFamily: theme.typography.fontFamily
                        }}
                    >
                        <br /><br /><br />
                        Drop file here 
                        <br />[{this.state.files.length} file(s) added].
                        <br /><br /><br /><br />
                    </Paper>
                    <div>
                        {this.state.files.map((file, index) => {
                            return (
                                <FileBox key={index} index={index} file={file} onClick={this.handleFileDelete} />
                            )
                        })}
                    </div>
                    <Divider />
                    <Button
                        fullWidth
                        className={classes.compressButton}
                        disabled={this.state.files.length == 0}
                        onClick={this.compress}
                        variant="contained"
                        color="primary"
                        size="large"
                    >
                        Compress Files
                    </Button>
                </Paper>
            </div>
        );
    }
}

export default withStyles(styles, { withTheme: true })(Compressor);;