describe('iD.serviceOsmose', function() {
    var context, server, osmose;

    before(function() {
        iD.services.osmose = iD.serviceOsmose;
    });

    after(function() {
        delete iD.services.osmose;
    });

    beforeEach(function() {
        context = iD.Context();
        server = sinon.fakeServer.create();
        osmose = iD.services.osmose;
        osmose.reset();
    });
    
    afterEach(function() {
        server.restore();
    });

    describe('#loadBounds', function() {
        it ('loads errors and indicates they\'ve been loaded', function() {
            var spy = sinon.spy();
            var bbox = '74.3788,18.3852,-73.8377,18.6807';
            osmose.on('loadedErrors', spy);
            osmose.loadBounds(bbox);

            var match = /en\/api\/0\.2\/errors/;
            var description = [
                'lat',
                'lon',
                'error_id',
                'item',
                'source',
                'class',
                'elems',
                'subclass',
                'subtitle',
                'title',
                'level',
                'update',
            ];

            var errors = [
                [
                    '18.5608254',
                    '-74.2576776',
                    '20957842697',
                    '0',
                    '1541',
                    '1',
                    'way392854549_way392854547',
                    '0',
                    '',
                    'Intersection de bâtiments',
                    '3',
                    '2018-11-14 21:14:02+00:00',
                    ''
                ]
            ];

            var response = { description: description, errors: errors };
            
            server.respondWith('GET', match,
                [200, { 'Content-Type': 'application/json' }, JSON.stringify(response) ]);
            server.respond();

            expect(spy).to.have.been.calledOnce;
        });
    });

    describe('#serialize', function() {
        it('turns osmose response into array of osmoseError objects', function() {
            var apiResponse = {
                description: [
                    'lat',
                    'lon',
                    'error_id',
                    'item',
                    'source',
                    'class',
                    'elems',
                    'subclass',
                    'subtitle',
                    'title',
                    'level',
                    'update',
                ],
                errors: [
                    [
                        '18.5608574',
                        '-74.2582846',
                        '21288888357',
                        '0',
                        '1541',
                        '2',
                        'way392866405_way392866403',
                        '0',
                        '',
                        'Large building intersection',
                        '2',
                        '2018-12-04 21:14:03+00:00',
                        ''
                    ],
                    [
                        '18.5467966',
                        '-74.2555612',
                        '21288888358',
                        '0',
                        '1541',
                        '1',
                        'way392867376_way392867372',
                        '0',
                        '',
                        'Building intersection',
                        '3',
                        '2018-12-04 21:14:03+00:00',
                        ''
                    ]
                ]
            };
            osmose.serialize(apiResponse).forEach(function (error) {
                expect(error).instanceOf(iD.OsmoseError);
            });
        });
    });
});