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
    './components/ControllTable.vue',
    'vue'
], function (
    ControllTableComponent,
    Vue
) {
    function ControllTableViewProvider(openmct) {
        return {
            key: 'Controll-Table',
            name: 'ControllTable',
            cssClass: 'icon-layout-view',
            canView: function (domainObject) {
                return domainObject.type === 'ControllTable';
            },
            canEdit: function (domainObject) {
                return domainObject.type === 'ControllTable';
            },
            view: function (domainObject, objectPath) {
                let component;

                return {
                    show: function (element, isEditing) {
                        component = new Vue({
                            el: element,
                            components: {
                                ControllTableComponent: ControllTableComponent.default
                            },
                            provide: {
                                openmct,
                                objectPath,
                                ControllTable: domainObject
                            },
                            data() {
                                return {
                                    isEditing: isEditing
                                };
                            },
                            template: '<controll-table-component ref="ControllTable" :isEditing="isEditing"></controll-table-component>'
                        });
                    },
                    getSelectionContext: function () {
                        return {
                            item: domainObject,
                            addContainer: component.$refs.ControllTable.addContainer,
                            deleteContainer: component.$refs.ControllTable.deleteContainer,
                            deleteFrame: component.$refs.ControllTable.deleteFrame,
                            type: 'ControllTable'
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

    return ControllTableViewProvider;
});






