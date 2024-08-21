/*****************************************************************************
 * Open MCT, Copyright (c) 2014-2022, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * Administration. All rights reserved.
 *
 * Open MCT is licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Open MCT includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/

define([
    './components/ButtonV2.vue',
    'vue'
], function (
    ButtonV2Component,
    Vue
) {
    function ButtonViewV2Provider(openmct) {
        return {
            key: 'ButtonV2',
            name: 'Controll Button V2',
            cssClass: 'icon-circle',
            canView: function (domainObject) {
                return domainObject.type === 'ControllButtonV2';
            },
            view: function (domainObject) {
                let component;
    
                return {
                    show: function (element) {
                        component = new Vue({
                            el: element,
                            components: {
                                ButtonV2Component: ButtonV2Component.default
                                
                            },
                            provide: {
                                openmct,
                                domainObject:domainObject
                            },
                           
                            template: '<Button-V2-component></Button-V2-component>'
                        });
                    },
                    destroy: function (element) {
                        component.$destroy();
                        component = undefined;
                    }
                };
            },
            priority: function () {
                return 1;
            }
        };
    }

    return ButtonViewV2Provider;
});








/* import ButtonComponent from './components/Button.vue';
//import StylesComponent from './components/Button.scss';
import Vue from 'vue';

export default function ButtonViewProvider(openmct) {
    return {
        key: 'Button',
        name: 'Controll Button',
        cssClass: 'icon-circle',
        canView: function (domainObject) {
            return domainObject.type === 'ControllButton';
        },
        view: function (domainObject) {
            let component;

            return {
                show: function (element) {
                    component = new Vue({
                        el: element,
                        components: {
                            WebPageComponent: ButtonComponent
                            //StylesView: StylesComponent
                        },
                        provide: {
                            openmct,
                            domainObject
                        },
                       
                        template: '<web-page-component></web-page-component>'
                    });
                },
                destroy: function (element) {
                    component.$destroy();
                    component = undefined;
                }
            };
        },
        priority: function () {
            return 1;
        }
    };
} */
