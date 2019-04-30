import React from "react";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Divider from "@material-ui/core/Divider";
import { withStyles } from "@material-ui/core/styles";
import VideoBox from "./VideoBox.component";
import Input from "@material-ui/core/Input";
import VideoSelector from "./VideoSelector.component";

type VideoPortalState = {
    currentVideoId: string,
    videoIds: string[]
}

type VideoPortalProps = {
    classes: any
}

const styles = {
    heading: {
        marginBottom: 10,
        marginLeft: 10,
        marginRight: 10
    },
    inputOutput: {
        paddingTop: 10
    },
    videoBox: {
    },
    videoIframe: {
        width: "100%",
        height: 315
    }
}

const VIDEO_PATTERN = new RegExp("v=[0-9a-zA-Z\-\_]{11}");

class VideoPortal extends React.Component<VideoPortalProps, VideoPortalState> {

    constructor(props) {
        super(props);
        this.state = {
            currentVideoId: "",
            videoIds: []
        };
    }

    handleVideoInput = (event) => {
        const currentVideoLink = event.target.value,
            currentVideoId = currentVideoLink.match(VIDEO_PATTERN)[0].split("=")[1];
        let videoIds = [...this.state.videoIds];
        videoIds.push(currentVideoId);
        this.setState({ currentVideoId, videoIds });
    }

    handlePlay = (event, videoId) => {
        this.setState({ currentVideoId: videoId });
    }

    handleCurrentVideoEnd = () => {
        let videoIds = [...this.state.videoIds];
        videoIds.push(videoIds[0]);
        videoIds.splice(0, 1);
        const currentVideoId = videoIds[0];
        this.setState({ currentVideoId, videoIds });
    }

    render() {
        const { classes } = this.props;
        return (
            <div>
                <Paper className={classes.inputOutput} square>
                    <div className={classes.heading}>
                        <Typography variant="h4" color="primary">YouTube Video Portal</Typography>
                    </div>
                    <Divider />
                    <div className={classes.videoBox}>
                        <VideoBox
                            videoId={this.state.currentVideoId}
                            onVideoEnd={this.handleCurrentVideoEnd}
                        />
                    </div>
                    <Input fullWidth onChange={this.handleVideoInput} placeholder=" Enter the link of the video.." value="" />
                    {this.state.videoIds.map((videoId, index) => {
                        return (
                            <VideoSelector videoId={videoId} key={index} handlePlay={this.handlePlay} playingNow={this.state.currentVideoId == videoId} />
                        )
                    })}
                </Paper>

            </div>
        )
    }
}

export default withStyles(styles, { withTheme: true })(VideoPortal);