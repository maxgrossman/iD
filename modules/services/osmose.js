import { osmoseError } from '../validations/osmose_error';
import { 
    utilQsString,
    utilRebind, 
    utilTiler
} from '../util'; 
import { getLocale } from '../util/locale';
import { geoExtent, geoScaleToZoom } from '../geo';
import { json as d3_json } from 'd3-request';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import _find from 'lodash-es/find';
import _forEach from 'lodash-es/forEach';
import _reduce from 'lodash-es/reduce';


var _osmoseCache;
var apiBase = 'http://osmose.openstreetmap.fr/' + getLocale() + '/api/0.2/errors';
var dispatch = d3_dispatch('loadedErrors');
var tileZoom = 14;
var tiler = utilTiler().zoomExtent([tileZoom, tileZoom]).skipNullIsland(true);

function serializer (prop, value) {
    var serializers =  {
        error_id: function() {
            return { 
                id: value
            };
        },
        elems: function() {
            return {
                entities: function () {
                    return value.split('_') // => [ 'way${someId}', 'way${someId}' ]    
                        .reduce(function(entityRefs, refs) {
                            refs = refs.match(/(way|node|relation|[0-9]+)/g);  //  => [ ['way', '${someId}], ['way', '${someId}'] ]
                            entityRefs.push({ // => { type: 'way', id: ${someId} }
                                type: refs[0],
                                id: refs[1]
                            });
                            return entityRefs;
                        }, []);
                }()
            };
        },
        default: function() {
            var serializedProp = {};
            serializedProp[prop] = value;
            return serializedProp;
        }
    };
    return (serializers[prop] || serializers.default)();
}

function abortRequest(i) {
    i.abort();
}

function loadTiles(projection) {
    var currZoom = Math.floor(geoScaleToZoom(projection));
    var tiles = tiler.getTiles(projection);
    
    _forEach(_osmoseCache.inflight, function(k, v) {
        var wanted = _find(tiles, function(tile) { return k.indexOf(tile.id + ',') === 0; });
        
        if (!wanted) {
            abortRequest(v);
            delete _osmoseCache.inflight[k];
        }
    
    })
}

export default {
    init: function() {
        if (!_osmoseCache) {
            this.reset();
        }
        this.event = utilRebind(this, dispatch, 'on');
    },
    reset: function() {
        _osmoseCache = { inflight: {}, loaded: {} };
    },
    loadErrors: function(projection) {
        loadTiles(projection);
    },
    loadBounds: function(bbox) {
        var serialize = this.serialize;
        d3_json(apiBase + '?' + utilQsString({ full: true, bbox: bbox }), function(error, results) {
            if (error) return;
            _osmoseCache = serialize(results);
            dispatch.call('loadedErrors');
        });
    },
    // api call returns description array
    // that describes each property in errors array element...
    // this uses it to serialize the response as a map of errors
    // where the key is the error_id and the value is the important
    // information in the error...
    serialize: function(osmose) {
        var guide = osmose.description.slice(2, osmose.description.length);
        var errors = osmose.errors;
        var serializeError = function(error) {
            var osmoseProps = guide.reduce(function (props, prop, index) {
                props = Object.assign(props, serializer(prop, error[index + 2]));
                return props;
            }, {});
            osmoseProps.loc = errors.slice(0, 2); // => [lat, lon]
            return osmoseProps;
        };
        return errors.reduce(function(errors, error) {
            error = serializeError(error);
            errors.push(osmoseError(error));
            return errors;
        }, []);
    }
};
