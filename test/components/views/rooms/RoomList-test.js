import React from 'react';
import ReactTestUtils from 'react-addons-test-utils';
import ReactDOM from 'react-dom';
import expect from 'expect';
import lolex from 'lolex';

import * as TestUtils from 'test-utils';

import sdk from '../../../../src/index';
import MatrixClientPeg from '../../../../src/MatrixClientPeg';
import { DragDropContext } from 'react-beautiful-dnd';

import dis from '../../../../src/dispatcher';
import DMRoomMap from '../../../../src/utils/DMRoomMap.js';
import GroupStore from '../../../../src/stores/GroupStore.js';

import { Room, RoomMember } from 'matrix-js-sdk';

function generateRoomId() {
    return '!' + Math.random().toString().slice(2, 10) + ':domain';
}

function createRoom(opts) {
    const room = new Room(generateRoomId());
    if (opts) {
        Object.assign(room, opts);
    }
    return room;
}

describe('RoomList', () => {
    let parentDiv = null;
    let sandbox = null;
    let client = null;
    let root = null;
    const myUserId = '@me:domain';
    let clock = null;

    const movingRoomId = '!someroomid';
    let movingRoom;
    let otherRoom;

    let myMember;
    let myOtherMember;

    beforeEach(function() {
        TestUtils.beforeEach(this);
        sandbox = TestUtils.stubClient(sandbox);
        client = MatrixClientPeg.get();
        client.credentials = {userId: myUserId};

        clock = lolex.install();

        DMRoomMap.makeShared();

        parentDiv = document.createElement('div');
        document.body.appendChild(parentDiv);

        const RoomList = sdk.getComponent('views.rooms.RoomList');
        const WrappedRoomList = TestUtils.wrapInMatrixClientContext(RoomList);
        root = ReactDOM.render(
            <DragDropContext>
                <WrappedRoomList searchFilter="" />
            </DragDropContext>
        , parentDiv);
        ReactTestUtils.findRenderedComponentWithType(root, RoomList);

        movingRoom = createRoom({name: 'Moving room'});
        expect(movingRoom.roomId).toNotBe(null);

        // Mock joined member
        myMember = new RoomMember(movingRoomId, myUserId);
        myMember.membership = 'join';
        movingRoom.getMember = (userId) => ({
            [client.credentials.userId]: myMember,
        }[userId]);

        otherRoom = createRoom({name: 'Other room'});
        myOtherMember = new RoomMember(otherRoom.roomId, myUserId);
        myOtherMember.membership = 'join';
        otherRoom.getMember = (userId) => ({
            [client.credentials.userId]: myOtherMember,
        }[userId]);

        // Mock the matrix client
        client.getRooms = () => [
            movingRoom,
            otherRoom,
            createRoom({tags: {'m.favourite': {order: 0.1}}, name: 'Some other room'}),
            createRoom({tags: {'m.favourite': {order: 0.2}}, name: 'Some other room 2'}),
            createRoom({tags: {'m.lowpriority': {}}, name: 'Some unimportant room'}),
            createRoom({tags: {'custom.tag': {}}, name: 'Some room customly tagged'}),
        ];

        const roomMap = {};
        client.getRooms().forEach((r) => {
            roomMap[r.roomId] = r;
        });

        client.getRoom = (roomId) => roomMap[roomId];
    });

    afterEach((done) => {
        if (parentDiv) {
            ReactDOM.unmountComponentAtNode(parentDiv);
            parentDiv.remove();
            parentDiv = null;
        }
        sandbox.restore();

        clock.uninstall();

        done();
    });

    function expectRoomInSubList(room, subListTest) {
        const RoomSubList = sdk.getComponent('structures.RoomSubList');
        const RoomTile = sdk.getComponent('views.rooms.RoomTile');

        const subLists = ReactTestUtils.scryRenderedComponentsWithType(root, RoomSubList);
        const containingSubList = subLists.find(subListTest);

        let expectedRoomTile;
        try {
            const roomTiles = ReactTestUtils.scryRenderedComponentsWithType(containingSubList, RoomTile);
            console.info({roomTiles: roomTiles.length});
            expectedRoomTile = roomTiles.find((tile) => tile.props.room === room);
        } catch (err) {
            // truncate the error message because it's spammy
            err.message = 'Error finding RoomTile for ' + room.roomId + ' in ' +
                subListTest + ': ' +
                err.message.split('componentType')[0] + '...';
            throw err;
        }

        expect(expectedRoomTile).toExist();
        expect(expectedRoomTile.props.room).toBe(room);
    }

    function expectCorrectMove(oldTag, newTag) {
        const getTagSubListTest = (tag) => {
            if (tag === undefined) return (s) => s.props.label.endsWith('Rooms');
            return (s) => s.props.tagName === tag;
        };

        // Default to finding the destination sublist with newTag
        const destSubListTest = getTagSubListTest(newTag);
        const srcSubListTest = getTagSubListTest(oldTag);

        // Set up the room that will be moved such that it has the correct state for a room in
        // the section for oldTag
        if (['m.favourite', 'm.lowpriority'].includes(oldTag)) movingRoom.tags = {[oldTag]: {}};
        if (oldTag === 'im.vector.fake.direct') {
            // Mock inverse m.direct
            DMRoomMap.shared().roomToUser = {
                [movingRoom.roomId]: '@someotheruser:domain',
            };
        }

        dis.dispatch({action: 'MatrixActions.sync', prevState: null, state: 'PREPARED', matrixClient: client});

        clock.runAll();

        expectRoomInSubList(movingRoom, srcSubListTest);

        dis.dispatch({action: 'RoomListActions.tagRoom.pending', request: {
            oldTag, newTag, room: movingRoom,
        }});

        // Run all setTimeouts for dispatches and room list rate limiting
        clock.runAll();

        expectRoomInSubList(movingRoom, destSubListTest);
    }

    function itDoesCorrectOptimisticUpdatesForDraggedRoomTiles() {
        describe('does correct optimistic update when dragging from', () => {
            it('rooms to people', () => {
                expectCorrectMove(undefined, 'im.vector.fake.direct');
            });

            it('rooms to favourites', () => {
                expectCorrectMove(undefined, 'm.favourite');
            });

            it('rooms to low priority', () => {
                expectCorrectMove(undefined, 'm.lowpriority');
            });

            // XXX: Known to fail - the view does not update immediately to reflect the change.
            // Whe running the app live, it updates when some other event occurs (likely the
            // m.direct arriving) that these tests do not fire.
            xit('people to rooms', () => {
                expectCorrectMove('im.vector.fake.direct', undefined);
            });

            it('people to favourites', () => {
                expectCorrectMove('im.vector.fake.direct', 'm.favourite');
            });

            it('people to lowpriority', () => {
                expectCorrectMove('im.vector.fake.direct', 'm.lowpriority');
            });

            it('low priority to rooms', () => {
                expectCorrectMove('m.lowpriority', undefined);
            });

            it('low priority to people', () => {
                expectCorrectMove('m.lowpriority', 'im.vector.fake.direct');
            });

            it('low priority to low priority', () => {
                expectCorrectMove('m.lowpriority', 'm.lowpriority');
            });

            it('favourites to rooms', () => {
                expectCorrectMove('m.favourite', undefined);
            });

            it('favourites to people', () => {
                expectCorrectMove('m.favourite', 'im.vector.fake.direct');
            });

            it('favourites to low priority', () => {
                expectCorrectMove('m.favourite', 'm.lowpriority');
            });
        });
    }

    describe('when no tags are selected', () => {
        itDoesCorrectOptimisticUpdatesForDraggedRoomTiles();
    });

    describe('when tags are selected', () => {
        function setupSelectedTag() {
            // Simulate a complete sync BEFORE dispatching anything else
            dis.dispatch({
                action: 'MatrixActions.sync',
                prevState: null,
                state: 'PREPARED',
                matrixClient: client,
            }, true);

            // Simulate joined groups being received
            dis.dispatch({
                action: 'GroupActions.fetchJoinedGroups.success',
                result: {
                    groups: ['+group:domain'],
                },
            }, true);

            // Simulate receiving tag ordering account data
            dis.dispatch({
                action: 'MatrixActions.accountData',
                event_type: 'im.vector.web.tag_ordering',
                event_content: {
                    tags: ['+group:domain'],
                },
            }, true);

            // GroupStore is not flux, mock and notify
            GroupStore.getGroupRooms = (groupId) => {
                return [movingRoom];
            };
            GroupStore._notifyListeners();

            // Select tag
            dis.dispatch({action: 'select_tag', tag: '+group:domain'}, true);
        }

        beforeEach(() => {
            setupSelectedTag();
        });

        it('displays the correct rooms when the groups rooms are changed', () => {
            GroupStore.getGroupRooms = (groupId) => {
                return [movingRoom, otherRoom];
            };
            GroupStore._notifyListeners();

            // Run through RoomList debouncing
            clock.runAll();

            // By default, the test will
            expectRoomInSubList(otherRoom, (s) => s.props.label.endsWith('Rooms'));
        });

        itDoesCorrectOptimisticUpdatesForDraggedRoomTiles();
    });
});


