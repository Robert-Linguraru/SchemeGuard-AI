export type View =
    | "home-dashboard"
    | "dashboard"
    | "analysis-dashboard"
    | "rules"
    | "upload"
    | "details"
    | "upload-details"
    | "profile"
    | "card-schemes"
    | "my-agent";

export type NavigationItem = {
    view: View;
    label: string;
    active: boolean;
};
