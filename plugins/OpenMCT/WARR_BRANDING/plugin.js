export default function () {
    return function install(openmct) {
        
        var protocol = window.location.protocol;
        
        let options = {
            smallLogoImage: protocol + '//' + window.location.host + '/exui_logo.svg',
            aboutHtml: 'EX-UI was initiated by Antonio Steiger in 2022. It makes heavy use of NASA\'s OpenMCT. The hope is that it will serve many generations of students at WARR Rocketry as the go-to rocket launch and test software.'
        };
        
        openmct.branding(options);
    };
}