/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AdminCreateAccount from './pages/AdminCreateAccount';
import AdminFirstLogin from './pages/AdminFirstLogin';
import AdminRoles from './pages/AdminRoles';
import EmailVerified from './pages/EmailVerified';
import ForgotPassword from './pages/ForgotPassword';
import Home from './pages/Home';
import ModerationQueue from './pages/ModerationQueue';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import RoleSelection from './pages/RoleSelection';
import SuspendedAccount from './pages/SuspendedAccount';
import VerifyEmail from './pages/VerifyEmail';
import AdminDisputeDashboard from './pages/AdminDisputeDashboard';
import DisputeDetail from './pages/DisputeDetail';
import SubmitEvidence from './pages/SubmitEvidence';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';


export const PAGES = {
    "AdminCreateAccount": AdminCreateAccount,
    "AdminFirstLogin": AdminFirstLogin,
    "AdminRoles": AdminRoles,
    "EmailVerified": EmailVerified,
    "ForgotPassword": ForgotPassword,
    "Home": Home,
    "ModerationQueue": ModerationQueue,
    "Register": Register,
    "ResetPassword": ResetPassword,
    "RoleSelection": RoleSelection,
    "SuspendedAccount": SuspendedAccount,
    "VerifyEmail": VerifyEmail,
    "AdminDisputeDashboard": AdminDisputeDashboard,
    "DisputeDetail": DisputeDetail,
    "SubmitEvidence": SubmitEvidence,
    "AdminDashboard": AdminDashboard,
    "AdminUsers": AdminUsers,
}

export const pagesConfig = {
    mainPage: "RoleSelection",
    Pages: PAGES,
};