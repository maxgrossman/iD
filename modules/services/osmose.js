import { osmoseError } from '../validations/osmose_error';
import { 
    utilQsString,
    utilRebind 
} from '../util'; 
import { getLocale } from '../util/locale';
import { geoExtent } from '../geo';
import { json as d3_json } from 'd3-request';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import _reduce from 'lodash-es/reduce';


var _osmoseCache = {};
var apiBase = 'http://osmose.openstreetmap.fr/' + getLocale() + '/api/0.2/errors';
var dispatch = d3_dispatch('loadedErrors');

var serializer = function(prop, value) {
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
};

export default {
    init: function() {
        if (!_osmoseCache) {
            this.reset();
        }
        this.event = utilRebind(this, dispatch, 'on');
    },
    reset: function() {
        _osmoseCache = {};
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
        return errors.reduce(function(errorsMap, error) {
            var props = serializeError(error);
            errorsMap[error[2]] = osmoseError(props);
            return errorsMap;
        }, {});
    }
};
