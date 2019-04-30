import { withStyles } from "@material-ui/core/styles";
import Divider from "@material-ui/core/Divider";
import Paper from "@material-ui/core/Paper";
import PropTypes from "prop-types";
import React from "react";

const styles = {
    root: {},
    inputOutput: {
      padding: 10
    }
};

type TwitterFeedState = {}

type TwitterFeedProps = {
    classes: any
}

class TwitterFeed extends React.Component<TwitterFeedProps, TwitterFeedState> {

    static propTypes = {
        classes: PropTypes.object.isRequired
    };

    constructor(props: TwitterFeedProps) {
        super(props);
        this.state = {};
    }

    componentDidMount () {
        const script = document.createElement("script");
        script.src = "https://platform.twitter.com/widgets.js";
        script.async = true;
        script.charset = "utf-8";
        document.body.appendChild(script);
    }

    render() {
        const { classes } = this.props;
        return (
            <div className={classes.root}>
                <Paper className={classes.inputOutput} square>
                    <div>
                        <center>
                            <a
                                className="twitter-timeline"
                                data-lang="en"
                                data-width="100%"
                                data-height="400"
                                data-dnt="true"
                                data-theme="light"
                                href="https://twitter.com/YashodhanMohan?ref_src=twsrc%5Etfw">
                            </a>
                        </center>
                    </div>
                    <div>
                        <a
                            href="https://twitter.com/YashodhanMohan?ref_src=twsrc%5Etfw"
                            className="twitter-follow-button"
                            data-size="large"
                            data-show-screen-name="false"
                            data-lang="en"
                            data-dnt="true"
                            data-show-count="false"></a>
                    </div>
                </Paper>
            </div>
        );
    }
}

export default withStyles(styles, { withTheme: true })(TwitterFeed);
