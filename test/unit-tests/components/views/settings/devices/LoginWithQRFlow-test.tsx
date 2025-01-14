/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { cleanup, fireEvent, render, screen, waitFor } from "jest-matrix-react";
import React from "react";
import {
    ClientRendezvousFailureReason,
    LegacyRendezvousFailureReason,
    MSC4108FailureReason,
} from "matrix-js-sdk/src/rendezvous";

import LoginWithQRFlow from "../../../../../../src/components/views/auth/LoginWithQRFlow";
import { LoginWithQRFailureReason, FailureReason } from "../../../../../../src/components/views/auth/LoginWithQR";
import { Click, Phase } from "../../../../../../src/components/views/auth/LoginWithQR-types";

describe("<LoginWithQRFlow />", () => {
    const onClick = jest.fn();

    const defaultProps = {
        onClick,
    };

    const getComponent = (props: {
        phase: Phase;
        onClick?: () => Promise<void>;
        failureReason?: FailureReason;
        code?: string;
        confirmationDigits?: string;
    }) => <LoginWithQRFlow {...defaultProps} {...props} />;

    beforeEach(() => {});

    afterEach(() => {
        onClick.mockReset();
        cleanup();
    });

    it("renders spinner while loading", async () => {
        const { container } = render(getComponent({ phase: Phase.Loading }));
        expect(container).toMatchSnapshot();
    });

    it("renders spinner whilst QR generating", async () => {
        const { container } = render(getComponent({ phase: Phase.ShowingQR }));
        expect(screen.getAllByTestId("cancel-button")).toHaveLength(1);
        expect(container).toMatchSnapshot();
        fireEvent.click(screen.getByTestId("cancel-button"));
        expect(onClick).toHaveBeenCalledWith(Click.Cancel, undefined);
    });

    it("renders QR code", async () => {
        const { container } = render(getComponent({ phase: Phase.ShowingQR, code: "mock-code" }));
        // QR code is rendered async so we wait for it:
        await waitFor(() => screen.getAllByAltText("QR Code").length === 1);
        expect(container).toMatchSnapshot();
    });

    it("renders code when connected", async () => {
        const { container } = render(getComponent({ phase: Phase.LegacyConnected, confirmationDigits: "mock-digits" }));
        expect(screen.getAllByText("mock-digits")).toHaveLength(1);
        expect(screen.getAllByTestId("decline-login-button")).toHaveLength(1);
        expect(screen.getAllByTestId("approve-login-button")).toHaveLength(1);
        expect(container).toMatchSnapshot();
        fireEvent.click(screen.getByTestId("decline-login-button"));
        expect(onClick).toHaveBeenCalledWith(Click.Decline, undefined);
        fireEvent.click(screen.getByTestId("approve-login-button"));
        expect(onClick).toHaveBeenCalledWith(Click.Approve, undefined);
    });

    it("renders spinner while signing in", async () => {
        const { container } = render(getComponent({ phase: Phase.WaitingForDevice }));
        expect(screen.getAllByTestId("cancel-button")).toHaveLength(1);
        expect(container).toMatchSnapshot();
        fireEvent.click(screen.getByTestId("cancel-button"));
        expect(onClick).toHaveBeenCalledWith(Click.Cancel, undefined);
    });

    it("renders spinner while verifying", async () => {
        const { container } = render(getComponent({ phase: Phase.Verifying }));
        expect(container).toMatchSnapshot();
    });

    it("renders check code confirmation", async () => {
        const { container } = render(getComponent({ phase: Phase.OutOfBandConfirmation }));
        expect(container).toMatchSnapshot();
    });

    describe("errors", () => {
        for (const failureReason of [
            ...Object.values(LegacyRendezvousFailureReason),
            ...Object.values(MSC4108FailureReason),
            ...Object.values(LoginWithQRFailureReason),
            ...Object.values(ClientRendezvousFailureReason),
        ]) {
            it(`renders ${failureReason}`, async () => {
                const { container } = render(
                    getComponent({
                        phase: Phase.Error,
                        failureReason,
                    }),
                );
                expect(screen.getAllByTestId("cancellation-message")).toHaveLength(1);
                expect(container).toMatchSnapshot();
            });
        }
    });
});
