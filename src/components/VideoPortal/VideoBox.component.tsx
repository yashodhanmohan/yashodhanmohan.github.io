import React from "react";
import { withStyles } from "@material-ui/core/styles";

const styles = {
    videoIframe: {
        width: "100%",
        height: 315,
        border: 0
    }
}

let loadYT;

class VideoBox extends React.Component<any, any> {

    player: YT.Player; youtubePlayerAnchor;

    constructor(props) {
        super(props);
    }

    componentDidMount() {
        if (!loadYT) {
            loadYT = new Promise((resolve) => {
                const tag = document.createElement("script")
                tag.src = 'https://www.youtube.com/iframe_api'
                const firstScriptTag = document.getElementsByTagName("script")[0]
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)
                window.onYouTubeIframeAPIReady = () => resolve(window.YT)
            })
        }

        loadYT.then((YT) => {
            this.player = new YT.Player(this.youtubePlayerAnchor, {
                height: 315,
                width: "100%",
                events: {
                    onStateChange: this.handlePlayerStateChange
                }
            })
        })
    }

    handlePlayerStateChange = (event) => {
        if(event.data == 0) {
            this.props.onVideoEnd();
        }
    }

    playVideo = (videoId: string) => {
        if(this.player) {
            this.player.loadVideoById(videoId);
        }
    }

    render() {
        this.playVideo(this.props.videoId);
        return (
            <div>
                <div ref={(r) => { this.youtubePlayerAnchor = r }}></div>
            </div>
        )
    }

}

export default withStyles(styles)(VideoBox);