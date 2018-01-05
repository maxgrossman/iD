import { t } from '../util/locale';

import { event as d3_event } from 'd3-selection';

import _clone from 'lodash-es/clone';

import {
    actionAddMidpoint,
    actionMoveNode,
    actionNoop
} from '../actions';

import { behaviorDraw } from './draw';
import { geoChooseEdge, geoHasSelfIntersections, geoVecAdd, geoExtent } from '../geo';
import { modeBrowse, modeSelect } from '../modes';
import { osmNode, osmWay } from '../osm';
import { actionAddEntity } from '../actions/add_entity';
import { actionAddVertex } from '../actions/add_vertex';
import { utilEntitySelector } from '../util/util';
import { actionChangeTags } from '../actions/change_tags';


export function behaviorDrawWay(context, wayId, index, mode, startGraph) {
    var origWay = context.entity(wayId);
    var isClosed = origWay.isClosed();
    var isOrthogonal = (mode.option === 'draw-orthogonal' && origWay.nodes.length > 2);
    var isReversed = typeof index !== 'undefined';
    var finished = true;
    var annotation = t((origWay.isDegenerate() ?
        'operations.start.annotation.' :
        'operations.continue.annotation.') + context.geometry(wayId)
    );
    var behavior = behaviorDraw(context);

    var mouseCoord = context.map().mouseCoordinates();
    var startIndex = isReversed ? 0 : origWay.nodes.length - 1;
    var start, end, ortho1, ortho2, segment;

    var _tempEdits = 0;

    if (isOrthogonal) {
        ortho1 = osmNode({ loc: context.entity(origWay.nodes[1]).loc });
        ortho2 = osmNode({ loc: context.entity(origWay.nodes[0]).loc });
    } else {
        start = osmNode({ loc: context.entity(origWay.nodes[startIndex]).loc });
        end = osmNode({ loc: mouseCoord });
        segment = osmWay({ 
            nodes: isReversed ? [end.id, start.id] : [start.id, end.id],
            tags: _clone(origWay.tags)
        });
    }

    end = osmNode({ loc: context.map().mouseCoordinates() });
    
    if (isOrthogonal) {
        context.replace(
            actionAddEntity(ortho1),
            actionAddEntity(ortho2),
            actionAddVertex(wayId, ortho1.id, undefined),
            actionAddVertex(wayId, ortho2.id, undefined)
        );
    } else if (isClosed) {
        var f = context[origWay.isDegenerate() ? 'replace' : 'perform'];
        f(actionAddEntity(end),actionAddVertex(wayId, end.id, index));
    } else {
        actionAddEntity(segment);
    }

    if (!isOrthogonal) {
        // Push an annotated state for undo to return back to.
        // We must make sure to remove this edit later.
        context.perform(actionNoop(), annotation);
        _tempEdits++;

        // Add the drawing node to the graph.
        // We must make sure to remove this edit later.
        context.perform(_actionAddDrawNode());
        _tempEdits++;
    }

    // related code
    // - `mode/drag_node.js`     `doMode()`
    // - `behavior/draw.js`      `click()`
    // - `behavior/draw_way.js`  `move()`

    function moveNew(targets) {
        for (var i = 0; i < targets.length; i++) {
            var entity = targets[i].entity;
            var loc = targets[i].loc;
            var point = targets[i].point;
            var selfNode = isOrthogonal ? [ortho1.id, ortho2.id][i] : end.id;
            var selfWay = (isOrthogonal || isClosed) ? wayId : segment.id;

            if (entity) { // snap to target entity unless dealing with it's self...
                if (entity.type === 'node' && entity.id !== selfNode) {
                    loc = entity.loc;
                } else if (entity.type === 'way' && entity.id !== selfWay) {
                    loc = geoChooseEdge(context.childNodes(entity), point, context.projection).loc;
                }
            }

            context.replace(actionMoveNode(selfNode, loc));
        }
    }

    function move(datum) {
        var nodeLoc = datum && datum.properties && datum.properties.entity && datum.properties.entity.loc;
        var nodeGroups = datum && datum.properties && datum.properties.nodes;
        var loc = context.map().mouseCoordinates();

        if (nodeLoc) {   // snap to node/vertex - a point target with `.loc`
            loc = nodeLoc;

        } else if (nodeGroups) {   // snap to way - a line target with `.nodes`
            var best = Infinity;
            for (var i = 0; i < nodeGroups.length; i++) {
                var childNodes = nodeGroups[i].map(function(id) { return context.entity(id); });
                var choice = geoChooseEdge(childNodes, context.mouse(), context.projection, end.id);
                if (choice && choice.distance < best) {
                    best = choice.distance;
                    loc = choice.loc;
                }
            }
        }

        context.replace(actionMoveNode(end.id, loc));
        end = context.entity(end.id);

        // check if this movement causes the geometry to break
        var doBlock = invalidGeometry(end, context.graph());
        context.surface()
            .classed('nope', doBlock);
    }


    function invalidGeometry(entity, graph) {
        var parents = graph.parentWays(entity);

        for (var i = 0; i < parents.length; i++) {
            var parent = parents[i];
            var nodes = parent.nodes.map(function(nodeID) { return graph.entity(nodeID); });
            if (parent.isClosed()) {
                if (geoHasSelfIntersections(nodes, entity.id)) {
                    return true;
                }
            }
        }

        return false;
    }


    function undone() {
        // Undo popped the history back to the initial annotated no-op edit.
        // Remove initial no-op edit and whatever edit happened immediately before it.
        context.pop(2);
        _tempEdits = 0;

        if (context.hasEntity(wayId)) {
            context.enter(mode);
        } else {
            context.enter(modeBrowse(context));
        }
    }


    function setActiveElements() {
        var active = isOrthogonal ? [wayId, ortho1.id, ortho2.id] : 
            isClosed ? [wayId, end.id] : [segment.id, start.id, end.id]; 
        context.surface().selectAll(utilEntitySelector(active))
            .classed('active', true);
    }


    var drawWay = function(surface) {
        behavior
            .on('move', moveNew)
            .on('click', drawWay.add)
            .on('clickWay', drawWay.addWay)
            .on('clickNode', drawWay.addNode)
            .on('clickTargets', drawWay.addDatumTargets)
            .on('undo', context.undo)
            .on('cancel', drawWay.cancel)
            .on('finish', drawWay.finish);

        if (isOrthogonal) {
            behavior.startSegment([ortho2.loc, ortho1.loc]);
        }

        context.map()
            .dblclickEnable(false)
            .on('drawn.draw', setActiveElements);

        setActiveElements();

        surface.call(behavior);

        context.history()
            .on('undone.draw', undone);
    };


    drawWay.off = function(surface) {
        // Drawing was interrupted unexpectedly.
        // This can happen if the user changes modes,
        // clicks geolocate button, a hashchange event occurs, etc.
        if (_tempEdits) {
            context.pop(_tempEdits);
            while (context.graph() !== startGraph) {
                context.pop();
            }
        }

        context.map()
            .on('drawn.draw', null);

        surface.call(behavior.off)
            .selectAll('.active')
            .classed('active', false);

        context.history()
            .on('undone.draw', null);
    };


    function _actionAddDrawNode() {
        return function(graph) {
            return graph
                .replace(end)
                .replace(origWay.addNode(end.id, index));
        };
    }


    function _actionReplaceDrawNode(newNode) {
        return function(graph) {
            if (isClosed) {
                return graph
                    .replace(origWay.addNode(newNode.id, index))
                    .remove(end);
            } else {
                return graph
                    .replace(graph.entity(wayId).addNode(newNode.id, index))
                    .remove(segment)
                    .remove(start);
            }
        };
    }


    // Accept the current position of the drawing node and continue drawing.
    drawWay.add = function(loc, d) {
        // prevent dupe nodes.
        var last = context.hasEntity(origWay.nodes[origWay.nodes.length - (isClosed ? 2 : 1)]);
        var isLast = last && last.loc[0] === loc[0] && last.loc[1] === loc[1];

        if ((d && d.properties && d.properties.nope) || context.surface().classed('nope')) {
            return;   // can't click here
        }

        context.pop(_tempEdits);
        _tempEdits = 0;

        context.perform(
            _actionAddDrawNode(),
            // actionAddMidpoint({ loc: loc, edge: edge }, newNode),
            annotation
        );

        context.enter(mode);
    };


    // Connect the way to an existing way.
    drawWay.addWay = function(loc, edge) {
        if (context.surface().classed('nope')) {
            return;   // can't click here
        }

        context.pop(_tempEdits);
        _tempEdits = 0;

        context.perform(
            _actionAddDrawNode(),
            actionAddMidpoint({ loc: loc, edge: edge }, end),
            annotation
        );

        context.enter(mode);
    };


    // Connect the way to an existing node and continue drawing.
    drawWay.addNode = function(node) {
        if (context.surface().classed('nope')) {
            return;   // can't click here
        }

        context.pop(_tempEdits);
        _tempEdits = 0;

        context.perform(
            _actionReplaceDrawNode(node),
            annotation
        );

        context.enter(mode);
    };

    // Add multiple click targets, snapping to entities if neccessary...
    drawWay.addDatumTargets = function(targets) {
        var newIds = [];
        var entity, target, choice, edge, newNode, i;

        // Avoid making orthogonal shapew w/duplicate
        // nodes (like a line)...
        for (i = 0; i < targets.length; i++) {
            entity = targets[i].entity;
            if (!entity) continue;
            if (entity.id === origWay.nodes[0] || entity.id === origWay.nodes[1]) return;
        }

        // for each target, 
        // create a node OR snap it to existing entity...
        for (i = 0; i < targets.length; i++) {
            target = targets[i];
            entity = target.entity;

            if (entity) {
                // get latest...
                // if multiple nodes snap to the same target entity, 
                // it may have been modified during the loop.
                
                if (entity.type === 'node') {
                    newIds.push(entity.id);
                } else if (entity.type === 'way') {
                    choice = geoChooseEdge(
                        context.childNodes(entity), target.point, context.projection
                    );
                    edge = [entity.nodes[choice.index - 1], entity.nodes[choice.index]];
                    newNode = osmNode({ loc: choice.loc });
                    context.replace(actionAddMidpoint({ loc: choice.loc, edge: edge }, newNode));
                    newIds.push(newNode.id);
                } else {
                    newNode = osmNode({ loc: target.loc });
                    newIds.push(newNode.id);
                }
            }
            
            // replace the temporary nodes...
            context.replace(function(graph) {
                var newWay = origWay;
                for (var i = 0; i < newIds.length; i++) {
                    newWay = newWay.addNode(newId[i], -1);
                }
                return graph
                    .replace(newWay)
                    .remove(ortho1)
                    .remove(ortho2);
            });

            // try to snap nearby nodes onto the new shape...
            if (!d3_event.altKey) {
                var pad = 3;
                var proj = context.projection;
                var newWay = context.entity(wayId);
                var extent = newWay.extent(context.graph());
                var min = geoVecAdd(proj(extent[0]), [ -pad,  pad ]);
                var max = geoVecAdd(proj(extent[1]), [  pad, -pad ]);
                var padExtent = geoExtent(proj.invert(min), proj.invert(max));
                
                var testNodes = context.intersects(padExtent).filter(function(entity) {
                    return entity.type === 'node' && newWay.nodes.indexOf(entity.id) === -1;
                });

                for (i = 0; i < testNodes.length; i++) {
                    choice = geoChooseEdge(context.childNodes(newWay), proj(testNodes[i].loc), proj);
                    if (choice.distance < pad) {
                        edge = [newWay.nodes[choice.index -1], newWay.nodes[choice.index]];
                        context.replace(actionAddMidpoint({ loc: choice.loc, edge: edge}, testNodes[i]));
                    }
                }
            }

            context.perform(actionChangeTags(wayId, { building: 'yes' }));
            
            finished = true;
            context.enter(modeBrowse(context));
        }
    };


    // Finish the draw operation, removing the temporary edits.
    // If the way has enough nodes to be valid, it's selected.
    // Otherwise, delete everything and return to browse mode.
    drawWay.finish = function() {
        if (context.surface().classed('nope')) {
            return;   // can't click here
        }

        context.pop(_tempEdits);
        _tempEdits = 0;

        var way = context.hasEntity(wayId);
        if (!way || way.isDegenerate()) {
            drawWay.cancel();
            return;
        }

        window.setTimeout(function() {
            context.map().dblclickEnable(true);
        }, 1000);

        context.enter(modeSelect(context, [wayId]).newFeature(true));
    };


    // Cancel the draw operation, delete everything, and return to browse mode.
    drawWay.cancel = function() {
        context.pop(_tempEdits);
        _tempEdits = 0;

        while (context.graph() !== startGraph) {
            context.pop();
        }

        window.setTimeout(function() {
            context.map().dblclickEnable(true);
        }, 1000);

        context.surface()
            .classed('nope', false);

        context.enter(modeBrowse(context));
    };


    drawWay.activeID = function() {
        if (!arguments.length) return end.id;
        // no assign
        return drawWay;
    };


    drawWay.tail = function(text) {
        behavior.tail(text);
        return drawWay;
    };


    return drawWay;
}
