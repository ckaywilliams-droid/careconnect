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
import AdminDashboard from './pages/AdminDashboard';
import AdminDisputeDashboard from './pages/AdminDisputeDashboard';
import AdminFirstLogin from './pages/AdminFirstLogin';
import AdminRoles from './pages/AdminRoles';
import AdminUsers from './pages/AdminUsers';
import CaregiverAvailability from './pages/CaregiverAvailability';
import CaregiverProfile from './pages/CaregiverProfile';
import DisputeDetail from './pages/DisputeDetail';
import EmailVerified from './pages/EmailVerified';
import FindCaregivers from './pages/FindCaregivers';
import ForgotPassword from './pages/ForgotPassword';
import Home from './pages/Home';
import ModerationQueue from './pages/ModerationQueue';
import ParentBookings from './pages/ParentBookings';
import PublicCaregiverProfile from './pages/PublicCaregiverProfile';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import RoleSelection from './pages/RoleSelection';
import SubmitEvidence from './pages/SubmitEvidence';
import SuspendedAccount from './pages/SuspendedAccount';
import VerifyEmail from './pages/VerifyEmail';
import ParentOnboarding from './pages/ParentOnboarding';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminCreateAccount": AdminCreateAccount,
    "AdminDashboard": AdminDashboard,
    "AdminDisputeDashboard": AdminDisputeDashboard,
    "AdminFirstLogin": AdminFirstLogin,
    "AdminRoles": AdminRoles,
    "AdminUsers": AdminUsers,
    "CaregiverAvailability": CaregiverAvailability,
    "CaregiverProfile": CaregiverProfile,
    "DisputeDetail": DisputeDetail,
    "EmailVerified": EmailVerified,
    "FindCaregivers": FindCaregivers,
    "ForgotPassword": ForgotPassword,
    "Home": Home,
    "ModerationQueue": ModerationQueue,
    "ParentBookings": ParentBookings,
    "PublicCaregiverProfile": PublicCaregiverProfile,
    "Register": Register,
    "ResetPassword": ResetPassword,
    "RoleSelection": RoleSelection,
    "SubmitEvidence": SubmitEvidence,
    "SuspendedAccount": SuspendedAccount,
    "VerifyEmail": VerifyEmail,
    "ParentOnboarding": ParentOnboarding,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};