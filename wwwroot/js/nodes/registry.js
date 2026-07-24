import * as hubsNode from './hubsNode.js';
import * as projectsNode from './projectsNode.js';
import * as foldersNode from './foldersNode.js';
import * as itemsNode from './itemsNode.js';
import * as exchangesNode from './exchangesNode.js';
import * as exchangeDataNode from './exchangeDataNode.js';
import * as outputNode from './outputNode.js';
import * as createExchangeNode from './createExchangeNode.js';
import * as viewerOutputNode from './viewerOutputNode.js';
import * as getViewsNode from './getViewsNode.js';
import * as filterNode from './filterNode.js';
import * as csvOutputNode from './csvOutputNode.js';
import * as excelOutputNode from './excelOutputNode.js';

// Keyed by the node type's `key` (matches backend/nodes/*.py NodeType.key).
export const NODE_HANDLERS = {
    hubs: hubsNode,
    projects: projectsNode,
    folders: foldersNode,
    items: itemsNode,
    exchanges: exchangesNode,
    process: exchangeDataNode,
    output: outputNode,
    logic: createExchangeNode,
    data: viewerOutputNode,
    get_views: getViewsNode,
    filter: filterNode,
    csv_output: csvOutputNode,
    excel_output: excelOutputNode,
};
