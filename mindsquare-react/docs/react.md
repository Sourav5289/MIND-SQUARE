# React 18 Framework Integration

## Overview
React is the core framework used to build the Mind Square Chess Academy SPA. It manages the component lifecycle, virtual DOM synchronization, routing, user interactive state, and data flows.

## Role in Mind Square
* **View Routing**: Triggers navigation updates between the Student Dashboard, Match Arena, Tactics Trainer, Rankings Podium, and Biometric Scanner.
* **Telemetry Sync**: Dynamically updates the global student state (ELO scores, daily check-in streaks, badges) and broadcasts it to the dashboard, leaderboard, and sidebar.
* **Simulated OAuth Lifecycle**: Manages user session keys to force layout re-renders on profile switching.

## Key Files
* [App.jsx](file:///Users/souravhm/Desktop/squares/mindsquare-react/src/App.jsx)
* [Dashboard.jsx](file:///Users/souravhm/Desktop/squares/mindsquare-react/src/components/Dashboard.jsx)
* [Arena.jsx](file:///Users/souravhm/Desktop/squares/mindsquare-react/src/components/Arena.jsx)
* [ReviewNavigator.jsx](file:///Users/souravhm/Desktop/squares/mindsquare-react/src/components/ReviewNavigator.jsx)

## Example Code Snippet
```jsx
// App.jsx — View routing and state sync
const renderActiveView = () => {
    switch (activeView) {
        case 'dashboard':
            return <Dashboard key={sessionKey} navigateTo={(v) => setActiveView(v)} onToast={showToast} />;
        case 'arena':
            return <Arena key={sessionKey} onToast={showToast} onOpenReview={() => setActiveView('review')} />;
        case 'review':
            return <ReviewNavigator key={sessionKey} customGameMoves={reviewMoves} onBackToArena={() => setActiveView('arena')} />;
        ...
    }
};
```
