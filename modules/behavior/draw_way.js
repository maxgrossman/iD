import { t } from '../util/locale';

import {
    actionAddMidpoint,
    actionMoveNode,
    actionNoop
} from '../actions';

import { behaviorDraw } from './draw';
import { geoChooseEdge, geoHasSelfIntersections } from '../geo';
import { modeBrowse, modeSelect } from '../modes';
import { osmNode } from '../osm';

import { utilEntitySelector } from '../util';


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

    var end = osmNode({ loc: context.map().mouseCoordinates() });

    // Push an annotated state for undo to return back to.
    // We must make sure to remove this edit later.
    context.perform(actionNoop(), annotation);
    _tempEdits++;

    // Add the drawing node to the graph.
    // We must make sure to remove this edit later.
    context.perform(_actionAddDrawNode());
    _tempEdits++;


    // related code
    // - `mode/drag_node.js`     `doMode()`
    // - `behavior/draw.js`      `click()`
    // - `behavior/draw_way.js`  `move()`
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
	    checkGeometry(true);

    }

    // Check whether this edit causes the geometry to break.
    // If so, class the surface with a nope cursor.
    // `skipLast` - include closing segment in the check, see #4655
    function checkGeometry(skipLast) {
        var doBlock = isInvalidGeometry(end, context.graph(), skipLast);
        context.surface()
        .classed('nope', doBlock);
    }

    function isInvalidGeometry(entity, graph, skipLast) {
        var parents = graph.parentWays(entity);

        for (var i = 0; i < parents.length; i++) {
            var parent = parents[i];
            var nodes = parent.nodes.map(function(nodeID) { return graph.entity(nodeID); });
            if (parent.isClosed()) {
                if (skipLast)  nodes.pop();   // disregard closing segment - #4655
                if (geoHasSelfIntersections(nodes, entity.id)) {
                    return true;
                }
            }
        }

        return false;
    }
    // related code
    // - `mode/drag_node.js`     `doMode()`
    // - `behavior/draw.js`      `click()`
    // - `behavior/draw_way.js`  `move()`

    function moveNew(targets) {
        for (var i = 0; i < targets.length; i++) {
            var datum = targets[i].entity;
            var nodeLoc = datum && datum.properties && datum.properties.entity  && datum.properties.entity.loc;
            var nodeGroups = datum && datum.properties && datum.properties.nodes;
            var loc = targets[i].loc;
            var point = targets[i].point;
            var selfNode = isOrthogonal ? [ortho1.id, ortho2.id][i] : end.id;
            var selfWay = (isOrthogonal || isClosed) ? wayId : segment.id;

            // if (entity) { // snap to target entity unless dealing with it's self...
            //     if (entity.type === 'node' && entity.id !== selfNode) {
            //         loc = entity.loc;
            //     } else if (entity.type === 'way' && entity.id !== selfWay) {
            //         loc = geoChooseEdge(context.childNodes(entity), point, context.projection).loc;
            //     }
            // }

            if (nodeLoc && datum.id !== selfNode) { // snap to node/vertex - a point target with `.loc`
                loc = nodeLoc;
            
            } else if (nodeGroups && datum.id !== selfWay) { // snap to way - a line target with `.nodes
                var best = Infinity;
                for (var j = 0; j < nodeGroups.length; j++) {
                    var childNodes = nodeGroups[i].map(function(id) { return context.entity(id); });
                    var choice = geoChooseEdge(childNodes, context.mouse(), context.projection, end.id);
                    if (choice && choice.distance < best) {
                        best = choice.distance;
                        loc = choice.loc;
                    }
                }
            }
            context.replace(actionMoveNode(selfNode, loc));
            context.replace(actionMoveNode(end.id, loc));
            end = context.entity(end.id);
	        checkGeometry(true);
        }
    }

    // function move(datum) {
    //     var nodeLoc = datum && datum.properties && datum.properties.entity && datum.properties.entity.loc;
    //     var nodeGroups = datum && datum.properties && datum.properties.nodes;
    //     var loc = context.map().mouseCoordinates();

    //     if (nodeLoc) {   // snap to node/vertex - a point target with `.loc`
    //         loc = nodeLoc;

    //     } else if (nodeGroups) {   // snap to way - a line target with `.nodes`
    //         var best = Infinity;
    //         for (var i = 0; i < nodeGroups.length; i++) {
    //             var childNodes = nodeGroups[i].map(function(id) { return context.entity(id); });
    //             var choice = geoChooseEdge(childNodes, context.mouse(), context.projection, end.id);
    //             if (choice && choice.distance < best) {
    //                 best = choice.distance;
    //                 loc = choice.loc;
    //             }
    //         }
    //     }

    //     context.replace(actionMoveNode(end.id, loc));
    //     end = context.entity(end.id);

    //     // check if this movement causes the geometry to break
    //     var doBlock = invalidGeometry(end, context.graph());
    //     context.surface()
    //         .classed('nope', doBlock);
    // }

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
            annotation
        );

        checkGeometry(false);   // skipLast = false
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

        checkGeometry(false);   // skipLast = false
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

        checkGeometry(false);   // skipLast = false
        context.enter(mode);
    };

    // Add multiple click targets, snapping to entities if neccessary...
    drawWay.addDatumTargets = function(targets) {
        var newIds = [];
        var entity, target, choice, edge, newNode, i;
        // Avoid making orthogonal shape w/duplicate
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
            
            // replace the temporary nodes (if not already there?)...
            context.replace(function(graph) {
                var newWay = origWay;
                for (var i = 0; i < newIds.length; i++) {
                    newWay = newWay.addNode(newIds[i], undefined);
                }
                return graph
                    .replace(newWay);
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
        checkGeometry(false);   // skipLast = false
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
