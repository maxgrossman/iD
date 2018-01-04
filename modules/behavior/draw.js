import _map from 'lodash-es/map';

import { dispatch as d3_dispatch } from 'd3-dispatch';

import {
    event as d3_event,
    mouse as d3_mouse,
    select as d3_select,
    touches as d3_touches
} from 'd3-selection';

import { d3keybinding as d3_keybinding } from '../lib/d3.keybinding.js';
import { behaviorEdit } from './edit';
import { behaviorHover } from './hover';
import { behaviorTail } from './tail';

import {
    geoChooseEdge,
    geoVecAdd,
    geoVecLength,
    geoVecPerp,
    geoViewportEdge,
} from '../geo';

import { osmEntity } from '../osm';

import { utilRebind } from '../util/rebind';


var _usedTails = {};
var _disableSpace = false;
var _lastSpace = null;


export function behaviorDraw(context) {
    var dispatch = d3_dispatch(
        'move', 'click', 'clickWay', 'clickNode', 'clickTargets', 'undo', 'cancel', 'finish'
    );

    var keybinding = d3_keybinding('draw');

    var hover = behaviorHover(context).altDisables(true)
        .on('hover', context.ui().sidebar.hover);
    var tail = behaviorTail();
    var edit = behaviorEdit(context);

    var startSegment = [];
    var closeTolerance = 4;
    var tolerance = 12;
    var _mouseLeave = false;
    var _lastMouse = null;

    // listen for shiftKey press.
    // present orthogonal draw mode accordingly...
    function keydown() {
        if (d3_event && d3_event.shiftKey) {
            context.surface().classed('behavior-draworthogonal', true);
        }
    }

    function keyup() {
        if (!d3_event || !d3_event.shiftKey) {
            context.surface().classed('behavior-draworthogonal', false);
        }
    }
    
    // returns array of touch targets 
    // - [{ entity: entity }, point: [x,y], loc: [lon,lat]]
    // when in normal draw mode, only return 1 target (the mouses loc)
    // when in `draw-orthogonal` && single way has been drawn,
    // return 2 targets, both perpendicular & defined magnitude away 
    // from way's endpoints..
    function getDatumTargets() {
        var altKey = d3_event.altKey;
        var mousePoint = context.map().mouse();
        var mouseLoc = context.map().mouseCoordinates();

        // true when single way is drawn in `draw-orthogonal mode...
        if (context.mode().option === 'draw-orthogonal' && startSegment.length === 2) {
            var p0 = context.projection(startSegment[0]);
            var p1 = context.projection(startSegment[1]);
            var surface = context.surfaceRect();
            var theta = Math.atan2(p1[1] - mousePoint[1], p1[0] - mousePoint[0]) -
                Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
            var height = geoVecLength(p1, mousePoint) * Math.sin(theta);
            var len = geoVecLength(p0, p1);
            var perpVec = geoVecPerp(p0, p1, height, len);
            var q0 = geoVecAdd(p0, perpVec);
            var q1 = geoVecAdd(p1, perpVec);
            var points = [q1, q0];
            return _map(points, function(p) {
                var target = document.elementFromPoint(p[0] + surface.left, p[1] + surface.top);
                var data = target && target.__data__;
                var entity = data instanceof osmEntity ? data : null;

                return {
                    entity: altKey ? null : entity,
                    point: p.map(function(c) { return Math.floor(c); }),
                    loc: context.projection.invert(p)
                };
            });
        } else {
            var d;
            if (d3_event.type === 'keydown') {
                d = _lastMouse && _lastMouse.target && _lastMouse.target.__data__;
            } else {
                d = d3_event.target && d3_event.target.__data__;
            }
            d = (d && d.properties && d.properties.target) ? d : {};
            return [{ 
                entity: altKey ? null : d,
                point: mousePoint,
                loc: mouseLoc
            }];
        }
    }

    // related code
    // - `mode/drag_node.js` `datum()`
    function datum() {
        if (d3_event.altKey) return {};

        var element;
        if (d3_event.type === 'keydown') {
            element = _lastMouse && _lastMouse.target;
        } else {
            element = d3_event.target;
        }

        // When drawing, snap only to touch targets..
        // (this excludes area fills and active drawing elements)
        var d = element.__data__;
        return (d && d.properties && d.properties.target) ? d : {};
    }


    function mousedown() {

        function point() {
            var p = context.container().node();
            return touchId !== null ? d3_touches(p).filter(function(p) {
                return p.identifier === touchId;
            })[0] : d3_mouse(p);
        }

        var mode = context.mode();

        // if 
        if (d3_event.shiftKey && (mode.id === 'add-area' || mode.id === 'add-line')) {
            mode.option = 'draw-orthogonal';
            d3_event.preventDefault();
            d3_event.stopPropagation();
            click();

        } else {

            var element = d3_select(this);
            var touchId = d3_event.touches ? d3_event.changedTouches[0].identifier : null;
            var t1 = +new Date();
            var p1 = point();

            element.on('mousemove.draw', null);

            d3_select(window).on('mouseup.draw', function() {
                var t2 = +new Date();
                var p2 = point();
                var dist = geoVecLength(p1, p2);

                element.on('mousemove.draw', mousemove);
                d3_select(window).on('mouseup.draw', null);

                if (dist < closeTolerance || (dist < tolerance && (t2 - t1) < 500)) {
                    // Prevent a quick second click
                    d3_select(window).on('click.draw-block', function() {
                        d3_event.stopPropagation();
                    }, true);

                    context.map().dblclickEnable(false);

                    window.setTimeout(function() {
                        context.map().dblclickEnable(true);
                        d3_select(window).on('click.draw-block', null);
                    }, 500);

                    click();
                }
            }, true);
        }
    }

    function mousemove() {
        _lastMouse = d3_event;
        dispatch.call('move', this, getDatumTargets());
    }

    function needsSegment() {
        return context.mode().option === 'draw-orthogonal' &&
            startSegment.length < 2;
    }

    function mouseup() {
        if (needsSegment()) click();
    }

    function mouseenter() {
        _mouseLeave = false;
    }


    function mouseleave() {
        _mouseLeave = true;
    }


    // related code
    // - `mode/drag_node.js`     `doMode()`
    // - `behavior/draw.js`      `click()`
    // - `behavior/draw_way.js`  `move()`
    function click() {
        var targets = getDatumTargets();

        if (targets.length > 1) {
            dispatch.call('clickTargets', this, getDatumTargets());
            return;
        }

        var d = targets[0];
        var e = d.entity;
        var target = e && e.id && context.hasEntity(e.id);

        var trySnap = geoViewportEdge(context.mouse(), context.map().dimensions()) === null;
        if (trySnap) {
            if (target && target.type === 'way') { // Snap to way
                var choice = geoChooseEdge(
                    context.childNodes(target), context.mouse(), context.projection, context.activeID()
                );
                if (choice) {
                    var edge = [target.nodes[choice.index - 1], target.nodes[choice.index]];
                    if (needsSegment()) startSegment.push(choice.loc);
                    dispatch.call('clickWay', this, choice.loc, edge);
                }
            } else if (target && target.type === 'node') {   // Snap to a node
                if (needsSegment()) startSegment.push(target.loc);
                dispatch.call('clickNode', this, target);
            } else { // handle as regular click if snap tries fail...
                if (needsSegment) startSegment.push(d.loc);
                dispatch.call('click', this, d.loc);
            }
        }

        // dispatch.call('click', this, context.map().mouseCoordinates());
    }


    function space() {
        d3_event.preventDefault();
        d3_event.stopPropagation();

        var currSpace = context.mouse();
        if (_disableSpace && _lastSpace) {
            var dist = geoVecLength(_lastSpace, currSpace);
            if (dist > tolerance) {
                _disableSpace = false;
            }
        }

        if (_disableSpace || _mouseLeave || !_lastMouse) return;

        // user must move mouse or release space bar to allow another click
        _lastSpace = currSpace;
        _disableSpace = true;

        d3_select(window).on('keyup.space-block', function() {
            d3_event.preventDefault();
            d3_event.stopPropagation();
            _disableSpace = false;
            d3_select(window).on('keyup.space-block', null);
        });

        click();
    }


    function backspace() {
        d3_event.preventDefault();
        dispatch.call('undo');
    }


    function del() {
        d3_event.preventDefault();
        dispatch.call('cancel');
    }


    function ret() {
        d3_event.preventDefault();
        dispatch.call('finish');
    }


    function draw(selection) {
        if (context.mode().option === 'draw-orthogonal' && startSegment.length === 2) {
            hover = null;
            context.map().vertexHoverEnable(false);
        } else {
            context.install(hover);
        }

        context.install(edit);

        if (!context.inIntro() && !_usedTails[tail.text()]) {
            context.install(tail);
        }

        keybinding
            .on('⌫', backspace)
            .on('⌦', del)
            .on('⎋', ret)
            .on('↩', ret)
            .on('space', space)
            .on('⌥space', space);

        selection
            .on('mouseenter.draw', mouseenter)
            .on('mouseleave.draw', mouseleave)
            .on('mousedown.draw', mousedown)
            .on('mousemove.draw', mousemove);

        d3_select(document)
            .call(keybinding);


        d3_select(window)
            .on('mouseup.draw', mouseup)
            .on('keydown.draw', keydown)
            .on('keyup.draw', keyup);

        keydown();

        return draw;
    }


    draw.off = function(selection) {
        context.ui().sidebar.hover.cancel();

        if (hover) {
            context.uninstall(hover);
        } else {
            context.map().vertexHoverEnable(true);
        }

        context.uninstall(edit);

        if (!context.inIntro() && !_usedTails[tail.text()]) {
            context.uninstall(tail);
            _usedTails[tail.text()] = true;
        }

        selection
            .on('mouseenter.draw', null)
            .on('mouseleave.draw', null)
            .on('mousedown.draw', null)
            .on('mousemove.draw', null);

        keyup();

        d3_select(window)
            .on('mouseup.draw', null)
            .on('keydown.draw', null)
            .on('keyup.draw', null);
            // note: keyup.space-block, click.draw-block should remain

        d3_select(document)
            .call(keybinding.off);
    };


    draw.tail = function(_) {
        tail.text(_);
        return draw;
    };

    draw.startSegment = function(_) {
        if (!arguments.length) return startSegment;
        startSegment = _ || [];
        return draw;
    }


    return utilRebind(draw, dispatch, 'on');
}
