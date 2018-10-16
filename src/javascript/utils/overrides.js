Ext.override(Rally.nav.Manager, {
    // Override to not automatically remove other parameters
    applyParameters: function(params, triggerNavStateChange, paramsToRemove) {
        var hash = parent.location.hash;
        var re = /(\w+)=(\d+)&?/g;
        var matches;
        var currentParams = {};
        while ((matches = re.exec(hash)) !== null) {
            var name = matches[1];
            var value = matches[2];
            // Add any params currently in the URL, unless they are in the remove list
            if (!paramsToRemove || !Ext.Array.contains(paramsToRemove, name)) {
                currentParams[name] = value;
            }
        }
        _.merge(currentParams, params);

        Rally.environment.getMessageBus().publish(Rally.nav.Message.applyParameters, currentParams, triggerNavStateChange, paramsToRemove);
    }
});

Ext.override(Rally.ui.gridboard.SharedViewComboBox, {
    getSharedViewParam: function() {
        // Must override `window.location` with `parent.location`
        var hash = parent.location.hash,
            matches = hash.match(/sharedViewId=(\d+)/);

        return matches && matches[1];
    },

    /**
     * Override to avoid a race condition when restoring columns.
     * _ensureLatestView is called out of the constructor after initComponent before store.load(), but store.load() is called immediately after
     * by the parent combobox. The asynchronous store.model.load() here will race with store.load() invoked by the parent. If
     * the store.load returns first, this function would miss the load event and never apply the latest view columns.
     * 
     * Ensure we don't miss the store.load() event by registering an event handler now (before the parent calls store.load()) and
     * that handler can act on the store.model.load() promise when it resolves. This allows both loads to proceed in parallel without
     * possibly missing the load event.
     */
    _ensureLatestView: function(state) {
        if (state.objectId && state.versionId) {
            var modelLoadDeferred = Ext.create('Deft.Deferred');
            this.store.model.load(state.objectId, {
                fetch: ['VersionId', 'Value'],
                success: function(record) {
                    modelLoadDeferred.resolve(record);
                }
            });
            this.store.on('load', function() {
                modelLoadDeferred.promise.then({
                    success: function(record) {
                        if (record && record.get('VersionId') !== state.versionId) {
                            this._applyView(this._decodeValue(record));
                        }
                    },
                    scope: this
                })
            }, this, { single: true });
        }
    },
})

Ext.override(Rally.ui.gridboard.plugin.GridBoardFieldPicker, {
    gridFieldBlackList: [
        'Changesets',
        'Children',
        // 'Description',
        // 'Notes',
        'ObjectID',
        'Predecessors',
        'RevisionHistory',
        'Subscription',
        'Successors',
        'TaskIndex',
        'Workspace',
        'VersionId'
    ]
});

Ext.override(Rally.ui.inlinefilter.PropertyFieldComboBox, {
    /**
     * @cfg {String[]} whiteListFields
     * field names that should be included from the filter row field combobox
     */
    defaultWhiteListFields: ['Milestones', 'Tags']
});

Ext.override(Rally.ui.grid.TreeGrid, {
    // Override needed to allow summaryType to be restored when a column with
    // summaryType config is added by the field picker
    _mergeColumnConfigs: function(newColumns, oldColumns) {
        return _.map(newColumns, function(newColumn) {
            // If the newly selected column is currently in oldColumns (this.columns), then
            // use the in-use column config to preserve its current settings
            var result = newColumn;
            var newColumnName = this._getColumnName(newColumn);
            var oldColumn = _.find(oldColumns, { dataIndex: newColumnName });
            if (oldColumn) {
                result = this._getColumnConfigFromColumn(oldColumn);
            }
            else if (this.config && this.config.columnCfgs) {
                // Otherwise, if the newly selected column appears in the original columnCfgs
                // use that config. (This allows the column picker to get any renderers or summary
                // config from the column config)
                var columnCfg = _.find(this.config.columnCfgs, { dataIndex: newColumnName });
                if (columnCfg) {
                    result = columnCfg;
                }
            }

            return result;
        }, this);
    },

    // Override needed to allow summaryType to be included when a column is restored
    // from state.
    _applyStatefulColumns: function(columns) {
        // TODO (tj) test default columns
        if (this.alwaysShowDefaultColumns) {
            _.each(this.columnCfgs, function(columnCfg) {
                if (!_.any(columns, { dataIndex: this._getColumnName(columnCfg) })) {
                    columns.push(columnCfg);
                }
            }, this);
        }

        if (this.config && this.config.columnCfgs) {
            // Merge the column config with the stateful column if the dataIndex is the same.
            // This allows use to pick up summaryType and custom renderers
            _.each(this.config.columnCfgs, function(columnCfg) {
                // Search by dataIndex or text
                var columnName = this._getColumnName(columnCfg);
                var columnState = _.find(columns, function(value) {
                    return (value.dataIndex === columnName || value.text === columnName);
                });
                if (columnState) {
                    // merge them (add renderer)
                    _.merge(columnState, columnCfg);
                }
            }, this);
        }

        this.columnCfgs = columns;
    }
});
