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
    './components/ControllTableV2.vue',
    'vue'
], function (
    ControllTableV2Component,
    Vue
) {
    function ControllTableViewV2Provider(openmct) {
        return {
            key: 'Controll-Table-V2',
            name: 'ControllTableV2',
            cssClass: 'icon-layout-view',
            canView: function (domainObject) {
                return domainObject.type === 'ControllTableV2';
            },
            canEdit: function (domainObject) {
                return domainObject.type === 'ControllTableV2';
            },
            view: function (domainObject, objectPath) {
                let component;

                return {
                    show: function (element, isEditing) {
                        component = new Vue({
                            el: element,
                            components: {
                                ControllTableV2Component: ControllTableV2Component.default
                            },
                            provide: {
                                openmct,
                                objectPath,
                                ControllTableV2: domainObject
                            },
                            data() {
                                return {
                                    isEditing: isEditing
                                };
                            },
                            template: '<controll-table-v2-component ref="ControllTableV2" :isEditing="isEditing"></controll-table-v2-component>'
                        });
                    },
                    getSelectionContext: function () {
                        return {
                            item: domainObject,
                            addContainer: component.$refs.ControllTableV2.addContainer,
                            deleteContainer: component.$refs.ControllTableV2.deleteContainer,
                            deleteFrame: component.$refs.ControllTableV2.deleteFrame,
                            type: 'ControllTableV2'
                        };
                    },
                    onEditModeChange: function (isEditing) {
                        component.isEditing = isEditing;
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

    return ControllTableViewV2Provider;
});






