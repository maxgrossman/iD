import { t } from '../util/locale';
import {
    actionAddEntity,
    actionAddMidpoint,
    actionAddVertex
} from '../actions';

import { behaviorAddWay } from '../behavior';
import { modeDrawLine } from './index';
import { osmNode, osmWay } from '../osm';


export function modeAddLine(context, option) {
    var mode = {
        id: 'add-line',
        button: 'line',
        title: t('modes.add_line.title'),
        description: t('modes.add_line.description'),
        key: '2',
        option: option
    };
    var behavior = behaviorAddWay(context)
        .tail(t('modes.add_line.tail'))
        .on('start', start)
        .on('startFromWay', startFromWay)
        .on('startFromNode', startFromNode);


    function start(loc) {
        var startGraph = context.graph(),
            node = osmNode({ loc: loc }),
            way = osmWay();

        if (mode.option === 'draw-orthogonal') {
            context.perform(
                actionAddEntity(node),
                actionAddEntity(way),
                actionAddVertex(way.id, node.id),
                actionAddVertex(way.id, node.id)
            );
        } else {
            context.perform(
                actionAddEntity(node),
                actionAddEntity(way),
                actionAddVertex(way.id, node.id)
            );
        }

        context.enter(modeDrawLine(context, way.id, startGraph, undefined, mode.option));
    }


    function startFromWay(loc, edge) {
        var startGraph = context.graph(),
            node = osmNode({ loc: loc }),
            way = osmWay();

        if (mode.option === 'draw-orthogonal') {
            context.perform(
                actionAddEntity(node),
                actionAddEntity(way),
                actionAddVertex(way.id, node.id),
                actionAddVertex(way.id, node.id),
                actionAddMidpoint({ loc: loc, edge: edge}, node)
            );
        } else {
            context.perform(
                actionAddEntity(node),
                actionAddEntity(way),
                actionAddVertex(way.id, node.id),
                actionAddMidpoint({ loc: loc, edge: edge }, node)
            );
        }

        context.enter(modeDrawLine(context, way.id, startGraph, undefined, mode.option));
    }


    function startFromNode(node) {
        var startGraph = context.graph(),
            way = osmWay();

        if (mode.option === 'draw-orthogonal') {
            context.perform(
                actionAddEntity(way),
                actionAddVertex(way.id, node.id),
                actionAddVertex(way.id, node.id)
            );
        } else {
            context.perform(
                actionAddEntity(way),
                actionAddVertex(way.id, node.id)
            );
        }

        context.enter(modeDrawLine(context, way.id, startGraph, undefined, mode.option));
    }


    mode.enter = function() {
        context.install(behavior);
    };


    mode.exit = function() {
        mode.option = option;
        context.uninstall(behavior);
    };

    return mode;
}
