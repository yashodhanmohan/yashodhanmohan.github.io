import React from "react";
import PropTypes from "prop-types";
import ProfileImage from "../../images/profile.jpeg";
import { withStyles } from "@material-ui/core/styles";
import Grid from "@material-ui/core/Grid";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";

const styles = {
    rootPaper: {
        padding: 10
    },
    profileImagePaper: {
        backgroundColor: "white",
        justifyContent: "center",
        display: "flex",
        alignItems: "center",
        padding: 5
    },
    profileImage: {
        width: "100%",
        height: "auto"
    },
    profile: {
    }
};

const PROFILE1 = {
    languages: ["English", "Hindi", { language: "Gujarati", readOnly: true }],
    skills: ["Fullstack Web Development", "Distributed Architectures", "High Performance Computing", "JVM Optimization"]
}

const PROFILE2 = {
    programmingLanguages: ["C++", "Javascript", "Python", "Java", "R"],
    frameworks: ["React", "Angular", "Spring", "Pandas"]
}

const PROFILE3 = {
    experience: "2 years",
    currentWorkplace: "Amazon",

}

function PersonalBanner(props) {
    const { classes, theme } = props;
    return (
        <div>
            <Grid container spacing={16} className={classes.rootPaper} style={{ backgroundColor: theme.palette.primary.main }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Paper className={classes.profileImagePaper} style={{ backgroundColor: theme.palette.primary.contrastText }} elevation={15} square>
                        <img className={classes.profileImage} src={ProfileImage}></img>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={9}>
                    <Paper className={classes.profile} style={{ backgroundColor: theme.palette.primary.main, color: theme.palette.primary.contrastText }} elevation={0} square>
                        <Typography variant="h3">
                            Yashodhan Mohan Bhatnagar
                        </Typography>
                        <Grid container>
                            <Grid item md={4} sm={12}>
                                <pre>{JSON.stringify(PROFILE1, null, 2)}</pre>
                            </Grid>
                            <Grid item md={4} sm={12}>
                                <pre>{JSON.stringify(PROFILE2, null, 2)}</pre>
                            </Grid>
                            <Grid item md={4} sm={12}>
                                <pre>{JSON.stringify(PROFILE3, null, 2)}</pre>
                            </Grid>
                        </Grid>


                    </Paper>
                </Grid>
            </Grid>
        </div>
    );
}

export default withStyles(styles, { withTheme: true })(PersonalBanner);
