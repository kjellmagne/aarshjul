"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import Link from "next/link";
import { getProviders, signIn, signOut, useSession } from "next-auth/react";
import {
  assignActivityLanes,
  buildRingLayout,
  cartesianToPolar,
  createTimeScale,
  hitTestArcSegment,
  hitTestRing,
  type RingGeometry
} from "@aarshjul/wheel-core";

type RingModel = {
  id: string;
  label: string;
  color: string;
  heightPct: number;
  accent: string;
};

type AppLanguage = "nb" | "en";

type RingTemplate = {
  id: string;
  labels: Record<AppLanguage, string>;
  heightPct: number;
  color?: string;
  accent?: string;
};

type ThemeId = "nordic" | "plandisc_light" | "fjord_blue" | "sand";
type WindowAnchorMode = "dynamic_today" | "manual";

type ThemePreset = {
  id: ThemeId;
  name: string;
  ui: {
    pageBg: string;
    toolbarBg: string;
    frameBg: string;
    panelBg: string;
    panelBorder: string;
    planButtonBg: string;
    planButtonBorder: string;
  };
  wheel: {
    canvasBg: string;
    ringStroke: string;
    categoryFill: string;
    categoryStroke: string;
    categoryText: string;
    weekRingFill: string;
    weekRingStroke: string;
    weekText: string;
    monthRingFill: string;
    monthRingStroke: string;
    monthText: string;
    gridStroke: string;
    activityText: string;
    recurringMark: string;
    activityStroke: string;
    centerFill: string;
    centerStroke: string;
    selectedActivityStroke: string;
    selectionStroke: string;
    seamLight: string;
    seamShadow: string;
    seamLine: string;
  };
  rings: Record<string, { color: string; accent: string }>;
  ringPalette: Array<{ color: string; accent: string }>;
};

type ActivityCadence = "NONE" | "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY";

type ActivityScheduleDraft = {
  cadence: ActivityCadence;
  deadlineAt: string;
  timezone: string;
  reminderOffsetsMinutes: number[];
  reminderEmails: string[];
  isEnabled: boolean;
};

type ActivityModel = {
  id: string;
  ringId: string;
  title: string;
  startAt: string;
  endAt: string;
  color: string;
  tags: string[];
  schedule?: ActivityScheduleDraft;
  recurring?: boolean;
};

type TagModel = {
  id: string;
  label: string;
  color: string;
  description: string;
};

type AngleSegment = {
  startAngle: number;
  endAngle: number;
  label: string;
};

type RingBand = {
  ring: RingModel;
  activityBand: RingGeometry;
  categoryBand: RingGeometry;
};

type ActivityShape = ActivityModel & {
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
};

type SelectedSlot = {
  ringId: string;
  startAt: string;
  endAt: string;
};

type ActivityTooltipState = {
  activityId: string;
  x: number;
  y: number;
};

type WindowJumpOption = {
  value: string;
  label: string;
};

type WheelConfigModel = {
  ringTemplates: RingTemplate[];
  tags: TagModel[];
  themeId: ThemeId;
  language: AppLanguage;
  seamShadowEnabled: boolean;
  windowAnchorMode: WindowAnchorMode;
};

type WheelSummary = {
  id: string;
  title: string;
  timezone: string;
  startDate: string;
  durationMonths: number;
  ownerId: string;
  updatedAt?: string;
  config?: unknown;
};

type ApiSchedule = {
  cadence: string;
  deadlineAt: string | null;
  timezone: string;
  reminderOffsetsMinutes: number[];
  reminderEmails: string[];
  isEnabled: boolean;
};

type ApiActivity = {
  id: string;
  ringId: string;
  title: string;
  description?: string | null;
  color: string;
  startAt: string;
  endAt: string;
  tags?: unknown;
  schedule?: ApiSchedule | null;
};

type ShareEntry = {
  id: string;
  targetType: "USER" | "AAD_GROUP";
  role: "VIEWER" | "EDITOR" | "OWNER";
  createdAt: string;
  user?: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
  group?: {
    id: string;
    tenantGroupId: string;
    displayName: string | null;
  } | null;
};

type ShareableUserOptionModel = {
  id: string;
  email: string | null;
  name: string | null;
};

type AdminOverviewModel = {
  users: number;
  wheels: number;
  activities: number;
  shares: number;
  groups: number;
  accounts: number;
  localAccounts: number;
  azureAccounts: number;
};

type AdminUserModel = {
  id: string;
  email: string | null;
  name: string | null;
  role: "MEMBER" | "ADMIN";
  isAdmin: boolean;
  isDisabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  hasLocalPassword: boolean;
  hasAzureIdentity: boolean;
  providers: string[];
  counts: {
    ownedWheels: number;
    wheelUserShares: number;
    activitiesCreated: number;
  };
};

type AdminTenantOptionModel = {
  id: string;
  name: string;
  slug: string;
};

type AdminTenantSettingsModel = {
  id: string;
  tenantName: string;
  supportEmail: string | null;
  timezone: string;
  defaultLanguage: "nb" | "en";
  allowLocalAuth: boolean;
  allowAzureAuth: boolean;
  azureTenantId: string | null;
  azureClientId: string | null;
  azureClientSecret: string | null;
  azureConfigured: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFrom: string | null;
  smtpReplyTo: string | null;
  smtpConfigured: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: null;
};

type UserTenantMembershipModel = {
  tenantId: string;
  role: "MEMBER" | "ADMIN";
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
};

type PublicTenantLoginOptionModel = {
  id: string;
  name: string;
  slug: string;
  allowLocalAuth: boolean;
  allowAzureAuth: boolean;
  azureConfigured: boolean;
};

const TIMEZONE = "Europe/Oslo";
const FULL_CIRCLE = Math.PI * 2;
const VIEWBOX_SIZE = 960;
const CENTER = 480;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.15;
const SEAM_ANGLE = 0;
const ACTIVE_TENANT_STORAGE_KEY = "aarshjul.activeTenantId";
const CATEGORY_LABEL_FONT_SIZE = 12;
const CATEGORY_LABEL_BASELINE_BIAS = 0.28;
const CATEGORY_LABEL_REPEAT_COUNT = 4;
const CATEGORY_LABEL_ARC_PADDING_FRACTION = 0.23;
const ACTIVITY_INNER_RADIUS = 138;
const ACTIVITY_OUTER_RADIUS = 360;
const WEEK_RING_INNER = ACTIVITY_OUTER_RADIUS + 3;
const WEEK_RING_OUTER = WEEK_RING_INNER + 34;
const MONTH_RING_INNER = WEEK_RING_OUTER;
const MONTH_RING_OUTER = MONTH_RING_INNER + 34;
const ZOOM_ANCHOR_RADIUS = MONTH_RING_OUTER + 2;
const SCHEDULE_REMINDER_OFFSETS = [60 * 24 * 14, 60 * 24 * 7, 60 * 24 * 2, 60 * 24, 120] as const;
const MONTH_NAMES: Record<AppLanguage, readonly string[]> = {
  nb: [
    "Januar",
    "Februar",
    "Mars",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Desember"
  ] as const,
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ] as const
};

const UI_TEXT: Record<
  AppLanguage,
  {
    previous: string;
    next: string;
    jumpTo: string;
    monthsSuffix: string;
    weekPrefix: string;
    quarterPrefix: string;
    copyWheel: string;
    openSharing: string;
    closeSharing: string;
    openSettings: string;
    settingsTitle: string;
    closeSettings: string;
    settingsPersonalHint: string;
    theme: string;
    language: string;
    languageNb: string;
    languageEn: string;
    periodAnchoring: string;
    dynamicAnchoring: string;
    manualAnchoring: string;
    seamShadow: string;
    activityTitle: string;
    activityHint: string;
    titleField: string;
    ringField: string;
    tagsField: string;
    selectedTagsLabel: string;
    noTagsSelected: string;
    openTagsDialog: string;
    closeTagsDialog: string;
    tagDialogTitle: string;
    existingTagsTitle: string;
    editTagTitle: string;
    newTagTitle: string;
    tagNameField: string;
    tagNamePlaceholder: string;
    tagDescriptionField: string;
    tagDescriptionPlaceholder: string;
    editTag: string;
    deleteTag: string;
    updateTag: string;
    cancel: string;
    saveTags: string;
    addTag: string;
    noTagsAvailable: string;
    tagDescriptionTooltipPrefix: string;
    advancedScheduleField: string;
    openScheduleDialog: string;
    closeScheduleDialog: string;
    scheduleDialogTitle: string;
    scheduleEnabledField: string;
    scheduleCadenceField: string;
    scheduleDeadlineField: string;
    scheduleTimezoneField: string;
    scheduleReminderOffsetsField: string;
    scheduleReminderEmailsField: string;
    scheduleReminderEmailPlaceholder: string;
    scheduleCadenceNone: string;
    scheduleCadenceOnce: string;
    scheduleCadenceDaily: string;
    scheduleCadenceWeekly: string;
    scheduleCadenceMonthly: string;
    reminderLabel14d: string;
    reminderLabel7d: string;
    reminderLabel2d: string;
    reminderLabel1d: string;
    reminderLabel2h: string;
    saveSchedule: string;
    scheduleSummaryNone: string;
    scheduleSummaryPrefix: string;
    startField: string;
    endField: string;
    colorField: string;
    openActivityModal: string;
    closeActivityModal: string;
    activityModalNew: string;
    activityModalEdit: string;
    updateActivity: string;
    addActivity: string;
    deleteActivity: string;
    categoryTitle: string;
    showAll: string;
    showNone: string;
    showLabel: string;
    categoryHint: string;
    newCategoryField: string;
    newCategoryPlaceholder: string;
    addCategory: string;
    openCategoryModal: string;
    editRing: string;
    closeCategoryModal: string;
    categoryModalTitle: string;
    categoryModalEditTitle: string;
    saveRing: string;
    sidebarTitle: string;
    filterViewTitle: string;
    searchFiltersPlaceholder: string;
    ringsSectionTitle: string;
    tagsSectionTitle: string;
    activitiesSectionTitle: string;
    categorySectionTitle: string;
    noMatches: string;
    tooltipCategory: string;
    tooltipTags: string;
    tooltipFrom: string;
    tooltipTo: string;
    newActivityTitle: string;
    copyFailed: string;
    copied: string;
    copiedDataUrl: string;
    copiedSvg: string;
    clipboardBlocked: string;
    clipboardBlockedPng: string;
    clipboardBlockedSvg: string;
    localEmail: string;
    localPassword: string;
    localName: string;
    localSignIn: string;
    localRegister: string;
    sysAdminOpenPage: string;
    localHaveAccount: string;
    localNeedAccount: string;
    forgotPassword: string;
    authOr: string;
    authProviderChoice: string;
    authProviderLocal: string;
    authProviderMicrosoft: string;
    azureUnavailable: string;
    noAuthProviders: string;
    localAuthFailed: string;
    localRegisterFailed: string;
    azureSignIn: string;
    userRoleLabel: string;
    activeTenantLabel: string;
    roleSystemAdmin: string;
    roleTenantAdmin: string;
    roleTenantMember: string;
    roleNoTenant: string;
    signIn: string;
    signOut: string;
    authRequired: string;
    loginTenantLabel: string;
    loginTenantUnavailable: string;
    loading: string;
    wheelField: string;
    createWheel: string;
    renameWheel: string;
    renameWheelPrompt: string;
    wheelCreatePrompt: string;
    wheelCreateDefaultTitle: string;
    wheelLoadFailed: string;
    wheelSaveFailed: string;
    retry: string;
    sharingTitle: string;
    shareRoleField: string;
    shareUserField: string;
    shareUserPickerField: string;
    shareUserPickerPlaceholder: string;
    shareUserPlaceholder: string;
    shareUserAction: string;
    shareGroupField: string;
    shareGroupPlaceholder: string;
    shareGroupAction: string;
    removeShare: string;
    noShares: string;
    deleteWheel: string;
    deleteWheelConfirm: string;
    deleteRing: string;
    deleteRingConfirm: string;
    minimumOneRing: string;
    advancedSetup: string;
    advancedSetupTitle: string;
    closeAdvancedSetup: string;
    azureTenantId: string;
    azureClientId: string;
    azureClientSecret: string;
    azureCallbackUri: string;
    azureCopyEnv: string;
    azureEnvCopied: string;
    azureSetupHow: string;
    azureSetupStep1: string;
    azureSetupStep2: string;
    azureSetupStep3: string;
    azureSetupStep4: string;
    azureSetupStep5: string;
    adminSetup: string;
    adminSetupTitle: string;
    adminSetupHint: string;
    closeAdminSetup: string;
    adminRefresh: string;
    adminOpenAzureSetup: string;
    adminOpenUserAdmin: string;
    smtpSettingsTitle: string;
    smtpSettingsHint: string;
    smtpHostField: string;
    smtpPortField: string;
    smtpSecureField: string;
    smtpUserField: string;
    smtpPassField: string;
    smtpFromField: string;
    smtpReplyToField: string;
    smtpTestToField: string;
    smtpSaveAction: string;
    smtpTestAction: string;
    smtpSaved: string;
    smtpTestSent: string;
    adminOverviewTitle: string;
    adminUsersTitle: string;
    adminTotalUsers: string;
    adminTotalWheels: string;
    adminTotalActivities: string;
    adminTotalShares: string;
    adminTotalGroups: string;
    adminTotalAccounts: string;
    adminLocalAccounts: string;
    adminAzureAccounts: string;
    adminUserName: string;
    adminUserEmail: string;
    adminUserRoles: string;
    adminUserProviders: string;
    adminUserStats: string;
    adminUserLastLogin: string;
    adminActions: string;
    adminUserStatus: string;
    adminUserStatusActive: string;
    adminUserStatusDisabled: string;
    adminUsersHint: string;
    userAdminTitle: string;
    closeUserAdmin: string;
    userAdminSearch: string;
    userAdminRoleFilter: string;
    userAdminStatusFilter: string;
    userAdminFilterAll: string;
    userAdminFilterAdmins: string;
    userAdminFilterMembers: string;
    userAdminFilterActive: string;
    userAdminFilterDisabled: string;
    adminNewUserTitle: string;
    adminNewUserNameField: string;
    adminNewUserEmailField: string;
    adminNewUserPasswordField: string;
    adminNewUserAdminToggle: string;
    adminCreateUser: string;
    adminEditUser: string;
    adminEditUserHint: string;
    adminPasswordOptional: string;
    adminSaveUser: string;
    adminCancelEditUser: string;
    adminEnableUser: string;
    adminDisableUser: string;
    adminDeleteUser: string;
    adminDeleteUserConfirm: string;
    adminGrantAdmin: string;
    adminRevokeAdmin: string;
    adminNoUsers: string;
    adminLoadFailed: string;
    adminTenantSectionTitle: string;
    adminTenantField: string;
    adminScopeHint: string;
    adminTenantNameField: string;
    adminTenantSupportEmailField: string;
    adminTenantTimezoneField: string;
    adminTenantLanguageField: string;
    adminTenantSave: string;
    adminTenantDiscard: string;
    adminTenantUnsaved: string;
    adminTenantSaved: string;
    adminTenantUnavailable: string;
    adminTenantManagedBySystemAdmin: string;
    systemAdminSetup: string;
  }
> = {
  nb: {
    previous: "Forrige",
    next: "Neste",
    jumpTo: "Ga til",
    monthsSuffix: "mnd",
    weekPrefix: "Uke",
    quarterPrefix: "K",
    copyWheel: "Kopier synlig hjul",
    openSharing: "Apne deling",
    closeSharing: "Lukk deling",
    openSettings: "Aapne innstillinger",
    settingsTitle: "Innstillinger",
    closeSettings: "Lukk innstillinger",
    settingsPersonalHint: "Personlige visningsvalg for din bruker.",
    theme: "Fargetema",
    language: "Sprak",
    languageNb: "Norsk",
    languageEn: "English",
    periodAnchoring: "Hvordan perioden starter",
    dynamicAnchoring: "Kalenderjustert (jan/halvaar/kvartal)",
    manualAnchoring: "Rullerende fra dagens uke",
    seamShadow: "Skygge ved eldst/nyest-overlapp",
    activityTitle: "Aktivitet",
    activityHint: "Klikk i en ring for a velge en uke, eller klikk en aktivitet for redigering.",
    titleField: "Tittel",
    ringField: "Ring",
    tagsField: "Tagger",
    selectedTagsLabel: "Valgte tagger",
    noTagsSelected: "Ingen tagger valgt.",
    openTagsDialog: "Administrer tagger",
    closeTagsDialog: "Lukk tagger",
    tagDialogTitle: "Tagger for aktivitet",
    existingTagsTitle: "Eksisterende tagger",
    editTagTitle: "Rediger tag",
    newTagTitle: "Ny tag",
    tagNameField: "Tag-navn",
    tagNamePlaceholder: "Skriv tag-navn",
    tagDescriptionField: "Beskrivelse",
    tagDescriptionPlaceholder: "Hva betyr denne taggen?",
    editTag: "Rediger",
    deleteTag: "Slett tag",
    updateTag: "Oppdater tag",
    cancel: "Avbryt",
    saveTags: "Ferdig",
    addTag: "Legg til tag",
    noTagsAvailable: "Ingen tagger ennå.",
    tagDescriptionTooltipPrefix: "Beskrivelse",
    advancedScheduleField: "Avansert planlegging",
    openScheduleDialog: "Rediger plan",
    closeScheduleDialog: "Lukk planlegging",
    scheduleDialogTitle: "Avansert planlegging",
    scheduleEnabledField: "Aktiver plan og påminnelser",
    scheduleCadenceField: "Frekvens",
    scheduleDeadlineField: "Frist",
    scheduleTimezoneField: "Tidssone",
    scheduleReminderOffsetsField: "Påminnelser før frist",
    scheduleReminderEmailsField: "E-postmottakere",
    scheduleReminderEmailPlaceholder: "navn@domene.no, team@domene.no",
    scheduleCadenceNone: "Ingen",
    scheduleCadenceOnce: "En gang",
    scheduleCadenceDaily: "Daglig",
    scheduleCadenceWeekly: "Ukentlig",
    scheduleCadenceMonthly: "Månedlig",
    reminderLabel14d: "2 uker",
    reminderLabel7d: "1 uke",
    reminderLabel2d: "2 dager",
    reminderLabel1d: "1 dag",
    reminderLabel2h: "2 timer",
    saveSchedule: "Lagre plan",
    scheduleSummaryNone: "Ingen plan eller påminnelser er satt.",
    scheduleSummaryPrefix: "Plan",
    startField: "Start",
    endField: "Slutt",
    colorField: "Farge",
    openActivityModal: "Ny aktivitet",
    closeActivityModal: "Lukk aktivitet",
    activityModalNew: "Ny aktivitet",
    activityModalEdit: "Rediger aktivitet",
    updateActivity: "Oppdater aktivitet",
    addActivity: "Legg til aktivitet",
    deleteActivity: "Slett",
    categoryTitle: "Ringer",
    showAll: "Vis alle",
    showNone: "Ingen",
    showLabel: "Vis",
    categoryHint: "Skjul eller vis ringer i hjulet.",
    newCategoryField: "Ny ring",
    newCategoryPlaceholder: "Skriv ringnavn",
    addCategory: "Ny ring",
    openCategoryModal: "Ny ring",
    editRing: "Rediger ring",
    closeCategoryModal: "Lukk",
    categoryModalTitle: "Ny ring",
    categoryModalEditTitle: "Rediger ring",
    saveRing: "Lagre ring",
    sidebarTitle: "Organisasjon",
    filterViewTitle: "Filtervisning",
    searchFiltersPlaceholder: "Sok i filtre",
    ringsSectionTitle: "Ringer",
    tagsSectionTitle: "Tagger",
    activitiesSectionTitle: "Aktiviteter",
    categorySectionTitle: "Ringer",
    noMatches: "Ingen treff",
    tooltipCategory: "Ring",
    tooltipTags: "Tagger",
    tooltipFrom: "Fra",
    tooltipTo: "Til",
    newActivityTitle: "Ny aktivitet",
    copyFailed: "Kunne ikke kopiere",
    copied: "Kopiert",
    copiedDataUrl: "Kopiert som bilde-URL",
    copiedSvg: "Kopiert som SVG-kode",
    clipboardBlocked: "Clipboard blokkert",
    clipboardBlockedPng: "Clipboard blokkert, lastet ned PNG",
    clipboardBlockedSvg: "Clipboard blokkert, lastet ned SVG",
    localEmail: "E-post",
    localPassword: "Passord",
    localName: "Navn",
    localSignIn: "Logg inn lokalt",
    localRegister: "Opprett lokal bruker",
    sysAdminOpenPage: "Systemadmin-innlogging",
    localHaveAccount: "Har du allerede konto?",
    localNeedAccount: "Trenger du lokal konto?",
    forgotPassword: "Glemt passord?",
    authOr: "eller",
    authProviderChoice: "Velg innlogging",
    authProviderLocal: "Lokal",
    authProviderMicrosoft: "Microsoft",
    azureUnavailable: "Microsoft-innlogging er ikke tilgjengelig akkurat nå.",
    noAuthProviders: "Ingen innloggingsleverandorer er aktivert. Kontakt administrator.",
    localAuthFailed: "Lokal innlogging feilet",
    localRegisterFailed: "Kunne ikke opprette lokal bruker",
    azureSignIn: "Logg inn med Azure AD",
    userRoleLabel: "Rolle",
    activeTenantLabel: "Aktiv tenant",
    roleSystemAdmin: "Systemadmin",
    roleTenantAdmin: "Tenant admin",
    roleTenantMember: "Tenant bruker",
    roleNoTenant: "Ingen tenant valgt",
    signIn: "Logg inn med Azure AD",
    signOut: "Logg ut",
    authRequired: "Du må logge inn for å bruke årshjulet.",
    loginTenantLabel: "Tenant",
    loginTenantUnavailable: "Ingen tenant er tilgjengelig for innlogging akkurat nå.",
    loading: "Laster...",
    wheelField: "Hjul",
    createWheel: "Nytt hjul",
    renameWheel: "Gi nytt navn",
    renameWheelPrompt: "Nytt navn på hjul",
    wheelCreatePrompt: "Navn på nytt hjul",
    wheelCreateDefaultTitle: "Nytt årshjul",
    wheelLoadFailed: "Kunne ikke laste hjuldata",
    wheelSaveFailed: "Kunne ikke lagre endringer",
    retry: "Prøv igjen",
    sharingTitle: "Deling",
    shareRoleField: "Rolle",
    shareUserField: "Del med bruker",
    shareUserPickerField: "Velg bruker",
    shareUserPickerPlaceholder: "Velg en bruker",
    shareUserPlaceholder: "bruker@domene.no",
    shareUserAction: "Del",
    shareGroupField: "Del med AAD-gruppe",
    shareGroupPlaceholder: "Azure gruppe-id",
    shareGroupAction: "Del gruppe",
    removeShare: "Fjern",
    noShares: "Ingen delinger ennå.",
    deleteWheel: "Slett hjul",
    deleteWheelConfirm: "Slette dette hjulet? Dette kan ikke angres.",
    deleteRing: "Slett ring",
    deleteRingConfirm: "Slette denne ringen? Aktiviteter i ringen slettes også.",
    minimumOneRing: "Hjulet må ha minst én ring.",
    advancedSetup: "Azure AD-oppsett",
    advancedSetupTitle: "Azure AD-oppsett",
    closeAdvancedSetup: "Lukk Azure AD-oppsett",
    azureTenantId: "Tenant ID",
    azureClientId: "Client ID",
    azureClientSecret: "Client Secret",
    azureCallbackUri: "Redirect URI",
    azureCopyEnv: "Lagre Azure-oppsett",
    azureEnvCopied: "Azure-oppsett lagret",
    azureSetupHow: "Slik setter du opp Azure AD",
    azureSetupStep1: "1. Opprett App registration i Azure AD.",
    azureSetupStep2: "2. Legg til Redirect URI nedenfor i Authentication.",
    azureSetupStep3: "3. Opprett en Client Secret i Certificates & secrets.",
    azureSetupStep4: "4. Lim inn verdiene under og lagre tenant-oppsettet.",
    azureSetupStep5: "5. Innlogging med Microsoft bruker tenantens lagrede oppsett.",
    adminSetup: "Tenant-oppsett",
    adminSetupTitle: "Tenant-oppsett",
    adminSetupHint: "Administrer brukere og oppsett for denne tenanten.",
    closeAdminSetup: "Lukk tenant-oppsett",
    adminRefresh: "Oppdater",
    adminOpenAzureSetup: "Azure AD-oppsett",
    adminOpenUserAdmin: "Brukeradministrasjon",
    smtpSettingsTitle: "E-postserver (SMTP)",
    smtpSettingsHint: "Brukes for varslinger og påminnelser i denne tenanten.",
    smtpHostField: "SMTP-vert",
    smtpPortField: "Port",
    smtpSecureField: "Bruk TLS/SSL (secure)",
    smtpUserField: "Brukernavn",
    smtpPassField: "Passord",
    smtpFromField: "Fra-adresse",
    smtpReplyToField: "Svar-til (valgfri)",
    smtpTestToField: "Testmottaker",
    smtpSaveAction: "Lagre e-postoppsett",
    smtpTestAction: "Send test-e-post",
    smtpSaved: "E-postoppsett lagret.",
    smtpTestSent: "Test-e-post sendt.",
    adminOverviewTitle: "Oversikt",
    adminUsersTitle: "Kontoer",
    adminTotalUsers: "Brukere",
    adminTotalWheels: "Hjul",
    adminTotalActivities: "Aktiviteter",
    adminTotalShares: "Delinger",
    adminTotalGroups: "AAD-grupper",
    adminTotalAccounts: "Innlogginger",
    adminLocalAccounts: "Lokale kontoer",
    adminAzureAccounts: "Azure-kontoer",
    adminUserName: "Navn",
    adminUserEmail: "E-post",
    adminUserRoles: "Roller",
    adminUserProviders: "Providere",
    adminUserStats: "Statistikk",
    adminUserLastLogin: "Sist innlogget",
    adminActions: "Handlinger",
    adminUserStatus: "Status",
    adminUserStatusActive: "Aktiv",
    adminUserStatusDisabled: "Deaktivert",
    adminUsersHint: "Opprett, rediger, deaktiver eller slett brukere i denne tenanten.",
    userAdminTitle: "Brukeradministrasjon",
    closeUserAdmin: "Lukk brukeradministrasjon",
    userAdminSearch: "Søk",
    userAdminRoleFilter: "Rollefilter",
    userAdminStatusFilter: "Statusfilter",
    userAdminFilterAll: "Alle",
    userAdminFilterAdmins: "Admin",
    userAdminFilterMembers: "Bruker",
    userAdminFilterActive: "Aktive",
    userAdminFilterDisabled: "Deaktiverte",
    adminNewUserTitle: "Ny bruker",
    adminNewUserNameField: "Navn",
    adminNewUserEmailField: "E-post",
    adminNewUserPasswordField: "Passord",
    adminNewUserAdminToggle: "Gi tenant admin-rolle",
    adminCreateUser: "Opprett bruker",
    adminEditUser: "Rediger bruker",
    adminEditUserHint: "Oppdater brukerdata, rolle og status.",
    adminPasswordOptional: "Nytt passord (valgfritt)",
    adminSaveUser: "Lagre bruker",
    adminCancelEditUser: "Avbryt redigering",
    adminEnableUser: "Aktiver",
    adminDisableUser: "Deaktiver",
    adminDeleteUser: "Slett",
    adminDeleteUserConfirm: "Slette denne brukeren fra tenanten?",
    adminGrantAdmin: "Gi admin",
    adminRevokeAdmin: "Fjern admin",
    adminNoUsers: "Ingen kontoer funnet.",
    adminLoadFailed: "Kunne ikke laste admin-data",
    adminTenantSectionTitle: "Tenant-oppsett",
    adminTenantField: "Tenant",
    adminScopeHint: "Velg tenant for oversikt og brukerstyring i denne sesjonen.",
    adminTenantNameField: "Tenant-navn",
    adminTenantSupportEmailField: "Support e-post",
    adminTenantTimezoneField: "Tidssone",
    adminTenantLanguageField: "Sprak",
    adminTenantSave: "Lagre tenant-oppsett",
    adminTenantDiscard: "Forkast",
    adminTenantUnsaved: "Ulagrede endringer.",
    adminTenantSaved: "Alle endringer lagret.",
    adminTenantUnavailable: "Ingen tenant tilgjengelig for denne admin-brukeren.",
    adminTenantManagedBySystemAdmin: "Overordnede tenant-innstillinger administreres av systemadmin.",
    systemAdminSetup: "Systemadmin"
  },
  en: {
    previous: "Previous",
    next: "Next",
    jumpTo: "Go to",
    monthsSuffix: "mo",
    weekPrefix: "Week",
    quarterPrefix: "Q",
    copyWheel: "Copy visible wheel",
    openSharing: "Open sharing",
    closeSharing: "Close sharing",
    openSettings: "Open settings",
    settingsTitle: "Settings",
    closeSettings: "Close settings",
    settingsPersonalHint: "Personal viewing preferences for your user.",
    theme: "Color theme",
    language: "Language",
    languageNb: "Norwegian",
    languageEn: "English",
    periodAnchoring: "How period starts",
    dynamicAnchoring: "Calendar aligned (Jan/half-year/quarter)",
    manualAnchoring: "Rolling from current week",
    seamShadow: "Oldest/newest overlap seam shadow",
    activityTitle: "Activity",
    activityHint: "Click a ring to pick a week, or click an activity to edit it.",
    titleField: "Title",
    ringField: "Ring",
    tagsField: "Tags",
    selectedTagsLabel: "Selected tags",
    noTagsSelected: "No tags selected.",
    openTagsDialog: "Manage tags",
    closeTagsDialog: "Close tags",
    tagDialogTitle: "Activity tags",
    existingTagsTitle: "Existing tags",
    editTagTitle: "Edit tag",
    newTagTitle: "New tag",
    tagNameField: "Tag name",
    tagNamePlaceholder: "Enter tag name",
    tagDescriptionField: "Description",
    tagDescriptionPlaceholder: "What does this tag mean?",
    editTag: "Edit",
    deleteTag: "Delete tag",
    updateTag: "Update tag",
    cancel: "Cancel",
    saveTags: "Done",
    addTag: "Add tag",
    noTagsAvailable: "No tags yet.",
    tagDescriptionTooltipPrefix: "Description",
    advancedScheduleField: "Advanced scheduling",
    openScheduleDialog: "Edit schedule",
    closeScheduleDialog: "Close scheduling",
    scheduleDialogTitle: "Advanced scheduling",
    scheduleEnabledField: "Enable schedule and reminders",
    scheduleCadenceField: "Cadence",
    scheduleDeadlineField: "Deadline",
    scheduleTimezoneField: "Timezone",
    scheduleReminderOffsetsField: "Reminders before deadline",
    scheduleReminderEmailsField: "Reminder e-mail recipients",
    scheduleReminderEmailPlaceholder: "name@domain.com, team@domain.com",
    scheduleCadenceNone: "None",
    scheduleCadenceOnce: "Once",
    scheduleCadenceDaily: "Daily",
    scheduleCadenceWeekly: "Weekly",
    scheduleCadenceMonthly: "Monthly",
    reminderLabel14d: "2 weeks",
    reminderLabel7d: "1 week",
    reminderLabel2d: "2 days",
    reminderLabel1d: "1 day",
    reminderLabel2h: "2 hours",
    saveSchedule: "Save schedule",
    scheduleSummaryNone: "No schedule or reminders configured.",
    scheduleSummaryPrefix: "Schedule",
    startField: "Start",
    endField: "End",
    colorField: "Color",
    openActivityModal: "Add activity",
    closeActivityModal: "Close activity",
    activityModalNew: "New activity",
    activityModalEdit: "Edit activity",
    updateActivity: "Update activity",
    addActivity: "Add activity",
    deleteActivity: "Delete",
    categoryTitle: "Rings",
    showAll: "Show all",
    showNone: "None",
    showLabel: "Show",
    categoryHint: "Hide or show rings in the wheel.",
    newCategoryField: "New ring",
    newCategoryPlaceholder: "Enter ring name",
    addCategory: "New ring",
    openCategoryModal: "New ring",
    editRing: "Edit ring",
    closeCategoryModal: "Close",
    categoryModalTitle: "New ring",
    categoryModalEditTitle: "Edit ring",
    saveRing: "Save ring",
    sidebarTitle: "Organization",
    filterViewTitle: "Filter view",
    searchFiltersPlaceholder: "Search filters",
    ringsSectionTitle: "Rings",
    tagsSectionTitle: "Tags",
    activitiesSectionTitle: "Activities",
    categorySectionTitle: "Rings",
    noMatches: "No matches",
    tooltipCategory: "Ring",
    tooltipTags: "Tags",
    tooltipFrom: "From",
    tooltipTo: "To",
    newActivityTitle: "New activity",
    copyFailed: "Could not copy",
    copied: "Copied",
    copiedDataUrl: "Copied as image URL",
    copiedSvg: "Copied as SVG code",
    clipboardBlocked: "Clipboard blocked",
    clipboardBlockedPng: "Clipboard blocked, downloaded PNG",
    clipboardBlockedSvg: "Clipboard blocked, downloaded SVG",
    localEmail: "Email",
    localPassword: "Password",
    localName: "Name",
    localSignIn: "Sign in locally",
    localRegister: "Create local user",
    sysAdminOpenPage: "System admin login",
    localHaveAccount: "Already have an account?",
    localNeedAccount: "Need a local account?",
    forgotPassword: "Forgot password?",
    authOr: "or",
    authProviderChoice: "Choose sign-in",
    authProviderLocal: "Local",
    authProviderMicrosoft: "Microsoft",
    azureUnavailable: "Microsoft sign-in is currently unavailable.",
    noAuthProviders: "No sign-in providers are enabled. Contact your administrator.",
    localAuthFailed: "Local sign-in failed",
    localRegisterFailed: "Could not create local user",
    azureSignIn: "Sign in with Azure AD",
    userRoleLabel: "Role",
    activeTenantLabel: "Active tenant",
    roleSystemAdmin: "System admin",
    roleTenantAdmin: "Tenant admin",
    roleTenantMember: "Tenant user",
    roleNoTenant: "No tenant selected",
    signIn: "Sign in with Azure AD",
    signOut: "Sign out",
    authRequired: "You must sign in to use the wheel.",
    loginTenantLabel: "Tenant",
    loginTenantUnavailable: "No tenant is currently available for sign-in.",
    loading: "Loading...",
    wheelField: "Wheel",
    createWheel: "New wheel",
    renameWheel: "Rename wheel",
    renameWheelPrompt: "New wheel name",
    wheelCreatePrompt: "Name your new wheel",
    wheelCreateDefaultTitle: "New annual wheel",
    wheelLoadFailed: "Could not load wheel data",
    wheelSaveFailed: "Could not save changes",
    retry: "Retry",
    sharingTitle: "Sharing",
    shareRoleField: "Role",
    shareUserField: "Share with user",
    shareUserPickerField: "Pick user",
    shareUserPickerPlaceholder: "Select a user",
    shareUserPlaceholder: "user@domain.com",
    shareUserAction: "Share",
    shareGroupField: "Share with AAD group",
    shareGroupPlaceholder: "Azure group id",
    shareGroupAction: "Share group",
    removeShare: "Remove",
    noShares: "No shares yet.",
    deleteWheel: "Delete wheel",
    deleteWheelConfirm: "Delete this wheel? This cannot be undone.",
    deleteRing: "Delete ring",
    deleteRingConfirm: "Delete this ring? Activities in this ring will also be deleted.",
    minimumOneRing: "The wheel must have at least one ring.",
    advancedSetup: "Azure AD setup",
    advancedSetupTitle: "Azure AD setup",
    closeAdvancedSetup: "Close Azure AD setup",
    azureTenantId: "Tenant ID",
    azureClientId: "Client ID",
    azureClientSecret: "Client Secret",
    azureCallbackUri: "Redirect URI",
    azureCopyEnv: "Save Azure setup",
    azureEnvCopied: "Azure setup saved",
    azureSetupHow: "How to set up Azure AD",
    azureSetupStep1: "1. Create an App registration in Azure AD.",
    azureSetupStep2: "2. Add the Redirect URI below in Authentication.",
    azureSetupStep3: "3. Create a Client Secret in Certificates & secrets.",
    azureSetupStep4: "4. Fill in values below and save tenant setup.",
    azureSetupStep5: "5. Microsoft sign-in uses the tenant's saved setup.",
    adminSetup: "Tenant setup",
    adminSetupTitle: "Tenant setup",
    adminSetupHint: "Manage users and setup for this tenant.",
    closeAdminSetup: "Close tenant setup",
    adminRefresh: "Refresh",
    adminOpenAzureSetup: "Azure AD setup",
    adminOpenUserAdmin: "User administration",
    smtpSettingsTitle: "E-mail server (SMTP)",
    smtpSettingsHint: "Used for notifications and reminders in this tenant.",
    smtpHostField: "SMTP host",
    smtpPortField: "Port",
    smtpSecureField: "Use TLS/SSL (secure)",
    smtpUserField: "Username",
    smtpPassField: "Password",
    smtpFromField: "From address",
    smtpReplyToField: "Reply-to (optional)",
    smtpTestToField: "Test recipient",
    smtpSaveAction: "Save e-mail setup",
    smtpTestAction: "Send test e-mail",
    smtpSaved: "E-mail setup saved.",
    smtpTestSent: "Test e-mail sent.",
    adminOverviewTitle: "Overview",
    adminUsersTitle: "Accounts",
    adminTotalUsers: "Users",
    adminTotalWheels: "Wheels",
    adminTotalActivities: "Activities",
    adminTotalShares: "Shares",
    adminTotalGroups: "AAD groups",
    adminTotalAccounts: "Sign-ins",
    adminLocalAccounts: "Local accounts",
    adminAzureAccounts: "Azure accounts",
    adminUserName: "Name",
    adminUserEmail: "Email",
    adminUserRoles: "Roles",
    adminUserProviders: "Providers",
    adminUserStats: "Stats",
    adminUserLastLogin: "Last login",
    adminActions: "Actions",
    adminUserStatus: "Status",
    adminUserStatusActive: "Active",
    adminUserStatusDisabled: "Disabled",
    adminUsersHint: "Create, edit, disable or delete users in this tenant.",
    userAdminTitle: "User administration",
    closeUserAdmin: "Close user administration",
    userAdminSearch: "Search",
    userAdminRoleFilter: "Role filter",
    userAdminStatusFilter: "Status filter",
    userAdminFilterAll: "All",
    userAdminFilterAdmins: "Admins",
    userAdminFilterMembers: "Members",
    userAdminFilterActive: "Active",
    userAdminFilterDisabled: "Disabled",
    adminNewUserTitle: "New user",
    adminNewUserNameField: "Name",
    adminNewUserEmailField: "E-mail",
    adminNewUserPasswordField: "Password",
    adminNewUserAdminToggle: "Grant tenant admin role",
    adminCreateUser: "Create user",
    adminEditUser: "Edit user",
    adminEditUserHint: "Update user details, role and status.",
    adminPasswordOptional: "New password (optional)",
    adminSaveUser: "Save user",
    adminCancelEditUser: "Cancel edit",
    adminEnableUser: "Enable",
    adminDisableUser: "Disable",
    adminDeleteUser: "Delete",
    adminDeleteUserConfirm: "Delete this user from the tenant?",
    adminGrantAdmin: "Grant admin",
    adminRevokeAdmin: "Revoke admin",
    adminNoUsers: "No accounts found.",
    adminLoadFailed: "Could not load admin data",
    adminTenantSectionTitle: "Tenant setup",
    adminTenantField: "Tenant",
    adminScopeHint: "Select tenant scope for overview and user management in this session.",
    adminTenantNameField: "Tenant name",
    adminTenantSupportEmailField: "Support e-mail",
    adminTenantTimezoneField: "Timezone",
    adminTenantLanguageField: "Language",
    adminTenantSave: "Save tenant setup",
    adminTenantDiscard: "Discard",
    adminTenantUnsaved: "Unsaved changes.",
    adminTenantSaved: "All changes saved.",
    adminTenantUnavailable: "No tenant is available for this admin account.",
    adminTenantManagedBySystemAdmin: "Tenant-wide settings are managed by system admin.",
    systemAdminSetup: "System admin"
  }
};

const RING_TEMPLATES: RingTemplate[] = [
  {
    id: "default",
    labels: {
      nb: "Standard",
      en: "Default"
    },
    heightPct: 36
  }
];

const THEME_PRESETS: Record<ThemeId, ThemePreset> = {
  nordic: {
    id: "nordic",
    name: "Nordic",
    ui: {
      pageBg: "radial-gradient(circle at 10% 0%, #e8ebf0, #d8dde4 65%)",
      toolbarBg: "linear-gradient(180deg, #e7ebf1 0%, #e0e5ec 100%)",
      frameBg: "linear-gradient(180deg, #d8dde3, #d3d8df)",
      panelBg: "linear-gradient(180deg, #f8fafd, #edf2f8)",
      panelBorder: "#bec6d2",
      planButtonBg: "#e6e8ed",
      planButtonBorder: "#aab3c2"
    },
    wheel: {
      canvasBg: "#dbdfe4",
      ringStroke: "#bec7d3",
      categoryFill: "#f8fafc",
      categoryStroke: "#cad2dc",
      categoryText: "#2f3749",
      weekRingFill: "#f8fafd",
      weekRingStroke: "#ccd3dd",
      weekText: "#4f586d",
      monthRingFill: "#fcfcfe",
      monthRingStroke: "#cfd6de",
      monthText: "#4d5569",
      gridStroke: "#aebfce",
      activityText: "#f8fbff",
      recurringMark: "#e9f2f8",
      activityStroke: "#f5f7fa",
      centerFill: "#dde1e7",
      centerStroke: "#c9d1db",
      selectedActivityStroke: "#ffffff",
      selectionStroke: "#2f3f57",
      seamLight: "rgba(255, 255, 255, 0.94)",
      seamShadow: "rgba(24, 35, 52, 0.30)",
      seamLine: "rgba(255, 255, 255, 0.96)"
    },
    rings: {
      marketing: { color: "#c0ddeb", accent: "#6da8c7" },
      finance: { color: "#dfdaf2", accent: "#c9c0eb" },
      hr: { color: "#efe4e5", accent: "#e8c7cd" }
    },
    ringPalette: [
      { color: "#c0ddeb", accent: "#6da8c7" },
      { color: "#dfdaf2", accent: "#c9c0eb" },
      { color: "#efe4e5", accent: "#e8c7cd" },
      { color: "#d7e7de", accent: "#7ab79a" },
      { color: "#e8e4d8", accent: "#b8a97a" },
      { color: "#d4dfef", accent: "#7e9fc7" }
    ]
  },
  plandisc_light: {
    id: "plandisc_light",
    name: "Plandisc Light",
    ui: {
      pageBg: "radial-gradient(circle at 10% 0%, #e2e5ea, #d2d7de 68%)",
      toolbarBg: "linear-gradient(180deg, #e6e9ee 0%, #dde2e8 100%)",
      frameBg: "linear-gradient(180deg, #d5dae1, #cfd5dc)",
      panelBg: "linear-gradient(180deg, #f6f8fb, #eaeff5)",
      panelBorder: "#b9c2cf",
      planButtonBg: "#dfe3e9",
      planButtonBorder: "#a7b1bf"
    },
    wheel: {
      canvasBg: "#d5d9df",
      ringStroke: "#b9c3cf",
      categoryFill: "#fcfcfd",
      categoryStroke: "#cfd6de",
      categoryText: "#2f3a4b",
      weekRingFill: "#ffffff",
      weekRingStroke: "#d2d8e0",
      weekText: "#3f4f64",
      monthRingFill: "#ffffff",
      monthRingStroke: "#cfd6df",
      monthText: "#3f4c60",
      gridStroke: "#bcc8d4",
      activityText: "#1f3147",
      recurringMark: "#26415d",
      activityStroke: "#f5f7fa",
      centerFill: "#dde1e7",
      centerStroke: "#c9d1db",
      selectedActivityStroke: "#ffffff",
      selectionStroke: "#304765",
      seamLight: "rgba(255, 255, 255, 0.95)",
      seamShadow: "rgba(19, 31, 50, 0.38)",
      seamLine: "rgba(255, 255, 255, 0.95)"
    },
    rings: {
      marketing: { color: "#d7e6f2", accent: "#88b3d3" },
      finance: { color: "#efeade", accent: "#e2d6b7" },
      hr: { color: "#cfe7ea", accent: "#76bcc4" }
    },
    ringPalette: [
      { color: "#d7e6f2", accent: "#88b3d3" },
      { color: "#efeade", accent: "#e2d6b7" },
      { color: "#cfe7ea", accent: "#76bcc4" },
      { color: "#e8deef", accent: "#c2a6da" },
      { color: "#e8ebd8", accent: "#b9c987" },
      { color: "#f0dede", accent: "#d5a4a4" }
    ]
  },
  fjord_blue: {
    id: "fjord_blue",
    name: "Fjord Blue",
    ui: {
      pageBg: "radial-gradient(circle at 12% 2%, #dce6ef, #c8d4df 68%)",
      toolbarBg: "linear-gradient(180deg, #e4ebf2 0%, #d9e2eb 100%)",
      frameBg: "linear-gradient(180deg, #ced9e4, #c3cfdb)",
      panelBg: "linear-gradient(180deg, #f4f8fc, #e8f0f8)",
      panelBorder: "#aab9c8",
      planButtonBg: "#dbe6f1",
      planButtonBorder: "#95a8bd"
    },
    wheel: {
      canvasBg: "#cfd8e2",
      ringStroke: "#aab9c8",
      categoryFill: "#f7fbff",
      categoryStroke: "#bdccd9",
      categoryText: "#1f3652",
      weekRingFill: "#f9fcff",
      weekRingStroke: "#c6d4e1",
      weekText: "#325070",
      monthRingFill: "#ffffff",
      monthRingStroke: "#c2cfda",
      monthText: "#2f4a68",
      gridStroke: "#9eb3c7",
      activityText: "#f6fbff",
      recurringMark: "#dbeaf6",
      activityStroke: "#f5f8fb",
      centerFill: "#d5dde6",
      centerStroke: "#bac7d4",
      selectedActivityStroke: "#ffffff",
      selectionStroke: "#224061",
      seamLight: "rgba(255, 255, 255, 0.96)",
      seamShadow: "rgba(18, 38, 63, 0.35)",
      seamLine: "rgba(255, 255, 255, 0.96)"
    },
    rings: {
      marketing: { color: "#c7dff4", accent: "#5f92c2" },
      finance: { color: "#d2e8e4", accent: "#5ea8a0" },
      hr: { color: "#e5e0f1", accent: "#9d8cc4" }
    },
    ringPalette: [
      { color: "#c7dff4", accent: "#5f92c2" },
      { color: "#d2e8e4", accent: "#5ea8a0" },
      { color: "#e5e0f1", accent: "#9d8cc4" },
      { color: "#f0e6d7", accent: "#c4a16d" },
      { color: "#dcead3", accent: "#89b86f" },
      { color: "#f0dfe6", accent: "#c07a96" }
    ]
  },
  sand: {
    id: "sand",
    name: "Sand",
    ui: {
      pageBg: "radial-gradient(circle at 12% 3%, #ebe3d7, #d7cec2 68%)",
      toolbarBg: "linear-gradient(180deg, #efe7dc 0%, #e5dbcf 100%)",
      frameBg: "linear-gradient(180deg, #ddd2c4, #d4c7b7)",
      panelBg: "linear-gradient(180deg, #fbf7ef, #f2eadf)",
      panelBorder: "#b9aa96",
      planButtonBg: "#efe4d6",
      planButtonBorder: "#b9a48c"
    },
    wheel: {
      canvasBg: "#ddd3c5",
      ringStroke: "#bfae98",
      categoryFill: "#fdfbf7",
      categoryStroke: "#d5c7b4",
      categoryText: "#4b3c2d",
      weekRingFill: "#fffdf9",
      weekRingStroke: "#d8cab8",
      weekText: "#5b4b3a",
      monthRingFill: "#fffefb",
      monthRingStroke: "#d7c9b8",
      monthText: "#564733",
      gridStroke: "#bda991",
      activityText: "#fffdf8",
      recurringMark: "#f7eee2",
      activityStroke: "#fffdf9",
      centerFill: "#e5ddd1",
      centerStroke: "#d0c2af",
      selectedActivityStroke: "#ffffff",
      selectionStroke: "#6c573f",
      seamLight: "rgba(255, 255, 255, 0.95)",
      seamShadow: "rgba(80, 58, 34, 0.24)",
      seamLine: "rgba(255, 255, 255, 0.95)"
    },
    rings: {
      marketing: { color: "#d9c2a9", accent: "#b98757" },
      finance: { color: "#e7dbc2", accent: "#c5ac76" },
      hr: { color: "#d7e3d3", accent: "#8ba885" }
    },
    ringPalette: [
      { color: "#d9c2a9", accent: "#b98757" },
      { color: "#e7dbc2", accent: "#c5ac76" },
      { color: "#d7e3d3", accent: "#8ba885" },
      { color: "#d9d8e8", accent: "#9a98be" },
      { color: "#e6d2d1", accent: "#ba8482" },
      { color: "#cfe0de", accent: "#7aa9a3" }
    ]
  }
};

const INITIAL_TAGS: TagModel[] = [];

const initialActivities: ActivityModel[] = [];

function polar(cx: number, cy: number, radius: number, angleRad: number) {
  const adjusted = angleRad - Math.PI / 2;
  return {
    x: cx + radius * Math.cos(adjusted),
    y: cy + radius * Math.sin(adjusted)
  };
}

function svgNum(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0";
}

function svgRotate(angleDeg: number, x: number, y: number): string {
  return `rotate(${svgNum(angleDeg, 3)} ${svgNum(x, 3)} ${svgNum(y, 3)})`;
}

function readableTangentDeg(angleRad: number): number {
  let deg = (angleRad * 180) / Math.PI + 90;
  const normalized = ((deg % 360) + 360) % 360;
  if (normalized > 90 && normalized < 270) {
    deg += 180;
  }
  return deg;
}

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function normalizeHexColor(input: string): string {
  const raw = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = raw.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return "#6da8c7";
}

function blendHexWithWhite(hex: string, ratio = 0.62): string {
  const normalized = normalizeHexColor(hex).slice(1);
  const channel = (offset: number) => Number.parseInt(normalized.slice(offset, offset + 2), 16);
  const r = channel(0);
  const g = channel(2);
  const b = channel(4);
  const mix = (value: number) => Math.round(value + (255 - value) * ratio);
  return `#${mix(r).toString(16).padStart(2, "0")}${mix(g).toString(16).padStart(2, "0")}${mix(b)
    .toString(16)
    .padStart(2, "0")}`;
}

function describeWedge(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
) {
  const delta = Math.max(0.0001, endAngle - startAngle);
  const largeArc = delta > Math.PI ? 1 : 0;
  const outerStart = polar(cx, cy, outerRadius, startAngle);
  const outerEnd = polar(cx, cy, outerRadius, endAngle);
  const innerEnd = polar(cx, cy, innerRadius, endAngle);
  const innerStart = polar(cx, cy, innerRadius, startAngle);

  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    "Z"
  ].join(" ");
}

function describeArcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const delta = Math.max(0.0001, endAngle - startAngle);
  const largeArc = delta > Math.PI ? 1 : 0;
  const p1 = polar(cx, cy, radius, startAngle);
  const p2 = polar(cx, cy, radius, endAngle);
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
}

function splitTitle(title: string, maxChars = 11): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 3);
}

function capitalizeFirst(label: string): string {
  if (!label) {
    return label;
  }
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function monthName(monthIndex: number, language: AppLanguage): string {
  const names = MONTH_NAMES[language];
  return names[Math.max(0, Math.min(11, monthIndex - 1))];
}

function formatDateForLanguage(date: DateTime, language: AppLanguage): string {
  if (language === "nb") {
    return `${date.day}. ${monthName(date.month, language)} ${date.year}`;
  }
  return `${monthName(date.month, language)} ${date.day}, ${date.year}`;
}

function toDateTimeLocalValue(iso: string, timezone = TIMEZONE): string {
  const date = DateTime.fromISO(iso, { zone: timezone });
  if (!date.isValid) {
    return "";
  }
  return date.toFormat("yyyy-LL-dd'T'HH:mm");
}

function createDefaultSchedule(slotEndAt: string): ActivityScheduleDraft {
  return {
    cadence: "ONCE",
    deadlineAt: toDateTimeLocalValue(slotEndAt),
    timezone: TIMEZONE,
    reminderOffsetsMinutes: [60 * 24 * 7, 60 * 24],
    reminderEmails: [],
    isEnabled: true
  };
}

function buildWeekSegments(scale: ReturnType<typeof createTimeScale>): AngleSegment[] {
  const start = DateTime.fromJSDate(scale.startAt, { zone: scale.timezone });
  const end = DateTime.fromJSDate(scale.endAt, { zone: scale.timezone });
  const segments: AngleSegment[] = [];
  let cursor = start;
  let guard = 0;

  while (cursor < end && guard < 80) {
    const next = cursor.plus({ weeks: 1 });
    segments.push({
      startAngle: scale.timeToAngle(cursor.toJSDate()),
      endAngle: scale.timeToAngle(next.toJSDate()),
      label: String(cursor.weekNumber)
    });
    cursor = next;
    guard += 1;
  }

  return segments.filter((segment) => segment.endAngle - segment.startAngle > 0.005);
}

function snapToVisibleWeek(
  date: DateTime,
  scale: ReturnType<typeof createTimeScale>
): { start: DateTime; end: DateTime } {
  const windowStart = DateTime.fromJSDate(scale.startAt, { zone: scale.timezone });
  const windowEnd = DateTime.fromJSDate(scale.endAt, { zone: scale.timezone });
  let slotStart = windowStart;
  let slotEnd = slotStart.plus({ weeks: 1 });
  let guard = 0;

  while (date >= slotEnd && slotEnd < windowEnd && guard < 120) {
    slotStart = slotEnd;
    slotEnd = slotStart.plus({ weeks: 1 });
    guard += 1;
  }

  if (slotEnd > windowEnd) {
    slotEnd = windowEnd;
  }

  return { start: slotStart, end: slotEnd };
}

function buildMonthSegments(scale: ReturnType<typeof createTimeScale>, language: AppLanguage): AngleSegment[] {
  const start = DateTime.fromJSDate(scale.startAt, { zone: scale.timezone });
  const end = DateTime.fromJSDate(scale.endAt, { zone: scale.timezone });
  const segments: AngleSegment[] = [];
  let cursor = start.startOf("month");

  while (cursor < end) {
    const next = cursor.plus({ months: 1 });
    segments.push({
      startAngle: scale.timeToAngle(cursor.toJSDate()),
      endAngle: scale.timeToAngle(next.toJSDate()),
      label: capitalizeFirst(monthName(cursor.month, language))
    });
    cursor = next;
  }

  return segments.filter((segment) => segment.endAngle - segment.startAngle > 0.005);
}

function parseIso(dateIso: string) {
  return DateTime.fromISO(dateIso, { zone: TIMEZONE });
}

function toIso(date: DateTime) {
  return date.toISO({ suppressMilliseconds: true }) ?? date.toISO();
}

function alignedWindowStart(referenceDate: DateTime, durationMonths: 3 | 6 | 12): DateTime {
  const date = referenceDate.startOf("day");
  if (durationMonths === 12) {
    return date.startOf("year");
  }
  if (durationMonths === 6) {
    const month = date.month >= 7 ? 7 : 1;
    return DateTime.fromObject({ year: date.year, month, day: 1 }, { zone: TIMEZONE });
  }
  const quarterStartMonth = Math.floor((date.month - 1) / 3) * 3 + 1;
  return DateTime.fromObject({ year: date.year, month: quarterStartMonth, day: 1 }, { zone: TIMEZONE });
}

function weekWindowStart(referenceDate: DateTime): DateTime {
  const date = referenceDate.startOf("day");
  const offset = (date.weekday - 1 + 7) % 7;
  return date.minus({ days: offset });
}

function slugifyCategoryId(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function slugifyTagId(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function buildRingsForTheme(theme: ThemePreset, language: AppLanguage, ringTemplates: RingTemplate[]): RingModel[] {
  return ringTemplates.map((ring, index) => {
    const fallback = theme.ringPalette[index % theme.ringPalette.length] ?? { color: "#dbe3ee", accent: "#90a9c8" };
    const mapped = theme.rings[ring.id] ?? fallback;
    return {
      id: ring.id,
      label: ring.labels[language],
      heightPct: ring.heightPct,
      color: ring.color ?? mapped.color,
      accent: ring.accent ?? mapped.accent
    };
  });
}

function buildRingBands(sourceRings: RingModel[]): RingBand[] {
  const ordered = [...sourceRings].reverse();
  const layout = buildRingLayout({
    innerRadius: ACTIVITY_INNER_RADIUS,
    outerRadius: ACTIVITY_OUTER_RADIUS,
    rings: ordered.flatMap((ring) => [
      { id: `activity:${ring.id}`, heightPct: ring.heightPct },
      { id: `category:${ring.id}`, heightPct: 8.5 }
    ])
  });

  const bands = ordered.map((ring) => {
    const activityBand = layout.find((entry) => entry.id === `activity:${ring.id}`);
    const categoryBand = layout.find((entry) => entry.id === `category:${ring.id}`);

    if (!activityBand || !categoryBand) {
      throw new Error(`Missing ring layout for ${ring.id}`);
    }

    return {
      ring,
      activityBand,
      categoryBand
    };
  });

  return [...bands].sort((a, b) => b.activityBand.outerRadius - a.activityBand.outerRadius);
}

function createDefaultRingTemplate(language: AppLanguage, accent = "#6da8c7"): RingTemplate {
  const color = blendHexWithWhite(accent, 0.62);
  return {
    id: "default",
    labels: {
      nb: language === "nb" ? "Standard" : "Default",
      en: language === "nb" ? "Default" : "Default"
    },
    heightPct: 36,
    color,
    accent
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeActivityScheduleFromApi(
  schedule: ApiSchedule | null | undefined,
  fallbackEndAt: string
): ActivityScheduleDraft {
  if (!schedule) {
    return createDefaultSchedule(fallbackEndAt);
  }

  const cadence: ActivityCadence =
    schedule.cadence === "NONE" ||
    schedule.cadence === "ONCE" ||
    schedule.cadence === "DAILY" ||
    schedule.cadence === "WEEKLY" ||
    schedule.cadence === "MONTHLY"
      ? schedule.cadence
      : "ONCE";

  return {
    cadence,
    deadlineAt: schedule.deadlineAt
      ? toDateTimeLocalValue(schedule.deadlineAt, schedule.timezone || TIMEZONE)
      : toDateTimeLocalValue(fallbackEndAt, schedule.timezone || TIMEZONE),
    timezone: schedule.timezone || TIMEZONE,
    reminderOffsetsMinutes: Array.isArray(schedule.reminderOffsetsMinutes)
      ? [...new Set(schedule.reminderOffsetsMinutes.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry >= 0))]
      : [],
    reminderEmails: Array.isArray(schedule.reminderEmails)
      ? [...new Set(schedule.reminderEmails.map((entry) => String(entry).trim()).filter(Boolean))]
      : [],
    isEnabled: Boolean(schedule.isEnabled)
  };
}

function normalizeActivityFromApi(activity: ApiActivity): ActivityModel {
  const tags = Array.isArray(activity.tags)
    ? [...new Set(activity.tags.map((entry) => String(entry).trim()).filter(Boolean))]
    : [];

  return {
    id: activity.id,
    ringId: activity.ringId,
    title: activity.title,
    startAt: activity.startAt,
    endAt: activity.endAt,
    color: normalizeHexColor(activity.color || "#6da8c7"),
    tags,
    schedule: normalizeActivityScheduleFromApi(activity.schedule, activity.endAt),
    recurring: false
  };
}

function parseWheelConfig(input: unknown): Partial<WheelConfigModel> {
  if (!isObject(input)) {
    return {};
  }

  const parsed: Partial<WheelConfigModel> = {};

  if (Array.isArray(input.ringTemplates)) {
    parsed.ringTemplates = input.ringTemplates
      .filter((entry): entry is Record<string, unknown> => isObject(entry))
      .map((entry) => {
        const rawLabels = isObject(entry.labels) ? entry.labels : {};
        return {
          id: String(entry.id ?? ""),
          labels: {
            nb: String(rawLabels.nb ?? ""),
            en: String(rawLabels.en ?? "")
          },
          heightPct: Number(entry.heightPct ?? 24),
          color: typeof entry.color === "string" ? normalizeHexColor(entry.color) : undefined,
          accent: typeof entry.accent === "string" ? normalizeHexColor(entry.accent) : undefined
        } satisfies RingTemplate;
      })
      .filter((entry) => entry.id.length > 0 && entry.labels.nb.length > 0 && entry.labels.en.length > 0 && entry.heightPct > 0);
  }

  if (Array.isArray(input.tags)) {
    parsed.tags = input.tags
      .filter((entry): entry is Record<string, unknown> => isObject(entry))
      .map((entry) => ({
        id: String(entry.id ?? ""),
        label: String(entry.label ?? ""),
        color: normalizeHexColor(typeof entry.color === "string" ? entry.color : "#5a8fc1"),
        description: String(entry.description ?? "")
      }))
      .filter((entry) => entry.id.length > 0 && entry.label.length > 0);
  }

  if (input.themeId === "nordic" || input.themeId === "plandisc_light" || input.themeId === "fjord_blue" || input.themeId === "sand") {
    parsed.themeId = input.themeId;
  }

  if (input.language === "nb" || input.language === "en") {
    parsed.language = input.language;
  }

  if (input.windowAnchorMode === "dynamic_today" || input.windowAnchorMode === "manual") {
    parsed.windowAnchorMode = input.windowAnchorMode;
  }

  if (typeof input.seamShadowEnabled === "boolean") {
    parsed.seamShadowEnabled = input.seamShadowEnabled;
  }

  return parsed;
}

function toIsoFromLocalDateTime(value: string, timezone: string): string | null {
  const local = DateTime.fromFormat(value, "yyyy-LL-dd'T'HH:mm", { zone: timezone });
  if (!local.isValid) {
    return null;
  }
  return local.toUTC().toISO({ suppressMilliseconds: true }) ?? local.toUTC().toISO();
}

export default function Page() {
  const { data: session, status, update } = useSession();
  const [localAuthMode, setLocalAuthMode] = useState<"login" | "register">("login");
  const [localEmail, setLocalEmail] = useState("");
  const [localPassword, setLocalPassword] = useState("");
  const [localName, setLocalName] = useState("");
  const [localAuthError, setLocalAuthError] = useState("");
  const [localAuthBusy, setLocalAuthBusy] = useState(false);
  const [hasAzureAuth, setHasAzureAuth] = useState(true);
  const [loginTenants, setLoginTenants] = useState<PublicTenantLoginOptionModel[]>([]);
  const [loginTenantId, setLoginTenantId] = useState("");
  const [language, setLanguage] = useState<AppLanguage>("nb");
  const [themeId, setThemeId] = useState<ThemeId>("nordic");
  const [ringTemplates, setRingTemplates] = useState<RingTemplate[]>(RING_TEMPLATES);
  const [seamShadowEnabled, setSeamShadowEnabled] = useState(true);
  const [windowAnchorMode, setWindowAnchorMode] = useState<WindowAnchorMode>("dynamic_today");
  const [isSharingOpen, setIsSharingOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminSetupOpen, setIsAdminSetupOpen] = useState(false);
  const [isAzureSetupDialogOpen, setIsAzureSetupDialogOpen] = useState(false);
  const [isUserAdminDialogOpen, setIsUserAdminDialogOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isWheelRenameDialogOpen, setIsWheelRenameDialogOpen] = useState(false);
  const [wheelRenameId, setWheelRenameId] = useState<string | null>(null);
  const [wheelRenameDraft, setWheelRenameDraft] = useState("");
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [wheels, setWheels] = useState<WheelSummary[]>([]);
  const [activeWheelId, setActiveWheelId] = useState<string | null>(null);
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [shareRole, setShareRole] = useState<"VIEWER" | "EDITOR" | "OWNER">("VIEWER");
  const [shareUserEmail, setShareUserEmail] = useState("");
  const [shareableUsers, setShareableUsers] = useState<ShareableUserOptionModel[]>([]);
  const [shareUserSelectionEmail, setShareUserSelectionEmail] = useState("");
  const [shareGroupId, setShareGroupId] = useState("");
  const [isSharingBusy, setIsSharingBusy] = useState(false);
  const [isHydratingWheel, setIsHydratingWheel] = useState(false);
  const [isWheelBusy, setIsWheelBusy] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminOverview, setAdminOverview] = useState<AdminOverviewModel | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserModel[]>([]);
  const [adminTenants, setAdminTenants] = useState<AdminTenantOptionModel[]>([]);
  const [activeAdminTenantId, setActiveAdminTenantId] = useState("");
  const [isAdminUserSaving, setIsAdminUserSaving] = useState(false);
  const [adminUserEditorMode, setAdminUserEditorMode] = useState<"create" | "edit" | null>(null);
  const [editingAdminUserId, setEditingAdminUserId] = useState<string | null>(null);
  const [editingAdminUserName, setEditingAdminUserName] = useState("");
  const [editingAdminUserEmail, setEditingAdminUserEmail] = useState("");
  const [editingAdminUserPassword, setEditingAdminUserPassword] = useState("");
  const [editingAdminUserIsAdmin, setEditingAdminUserIsAdmin] = useState(false);
  const [editingAdminUserIsDisabled, setEditingAdminUserIsDisabled] = useState(false);
  const [userAdminFilterQuery, setUserAdminFilterQuery] = useState("");
  const [userAdminFilterRole, setUserAdminFilterRole] = useState<"ALL" | "ADMIN" | "MEMBER">("ALL");
  const [userAdminFilterStatus, setUserAdminFilterStatus] = useState<"ALL" | "ACTIVE" | "DISABLED">("ALL");
  const [adminTenantSettings, setAdminTenantSettings] = useState<AdminTenantSettingsModel | null>(null);
  const [isAzureSetupSaving, setIsAzureSetupSaving] = useState(false);
  const [isSmtpSaving, setIsSmtpSaving] = useState(false);
  const [isSmtpTesting, setIsSmtpTesting] = useState(false);
  const [userTenants, setUserTenants] = useState<UserTenantMembershipModel[]>([]);
  const [tenantChooserId, setTenantChooserId] = useState("");
  const [isTenantChooserOpen, setIsTenantChooserOpen] = useState(false);
  const [isSwitchingTenant, setIsSwitchingTenant] = useState(false);
  const [tenantScopeError, setTenantScopeError] = useState("");
  const isHydratingRef = useRef(false);
  const loadedWheelIdRef = useRef<string | null>(null);
  const configSaveTimerRef = useRef<number | null>(null);
  const durationSaveTimerRef = useRef<number | null>(null);
  const sharingPopoverRef = useRef<HTMLElement | null>(null);
  const sharingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const settingsPopoverRef = useRef<HTMLElement | null>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const adminSetupModalRef = useRef<HTMLElement | null>(null);
  const azureSetupDialogRef = useRef<HTMLElement | null>(null);
  const userAdminDialogRef = useRef<HTMLElement | null>(null);
  const activityModalRef = useRef<HTMLElement | null>(null);
  const categoryModalRef = useRef<HTMLElement | null>(null);
  const wheelRenameDialogRef = useRef<HTMLElement | null>(null);
  const activityTagDialogRef = useRef<HTMLElement | null>(null);
  const activityScheduleDialogRef = useRef<HTMLElement | null>(null);
  const wheelFrameRef = useRef<HTMLElement | null>(null);
  const wheelSvgRef = useRef<SVGSVGElement | null>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const tooltipPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const tagTooltipTimerRef = useRef<number | null>(null);
  const tagTooltipPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const tenantBootstrapRef = useRef(false);
  const [durationMonths, setDurationMonths] = useState<3 | 6 | 12>(12);
  const [startDate, setStartDate] = useState("2026-01-01");
  const [activeCategoryIds, setActiveCategoryIds] = useState<string[]>(() => RING_TEMPLATES.map((ring) => ring.id));
  const [activeTagKeys, setActiveTagKeys] = useState<string[]>([]);
  const [tags, setTags] = useState<TagModel[]>(INITIAL_TAGS);
  const [activities, setActivities] = useState<ActivityModel[]>(initialActivities);
  const [zoom, setZoom] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [activityTooltip, setActivityTooltip] = useState<ActivityTooltipState | null>(null);
  const [tagTooltip, setTagTooltip] = useState<{ label: string; description: string; color: string; x: number; y: number } | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#6da8c7");
  const [editingRingId, setEditingRingId] = useState<string | null>(null);
  const [azureTenantId, setAzureTenantId] = useState("");
  const [azureClientId, setAzureClientId] = useState("");
  const [azureClientSecret, setAzureClientSecret] = useState("");
  const [azureCopyNotice, setAzureCopyNotice] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpReplyTo, setSmtpReplyTo] = useState("");
  const [smtpTestTo, setSmtpTestTo] = useState("");
  const [smtpNotice, setSmtpNotice] = useState("");
  const [draftTagIds, setDraftTagIds] = useState<string[]>([]);
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagDescription, setNewTagDescription] = useState("");
  const [newTagColor, setNewTagColor] = useState("#5a8fc1");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [draftSchedule, setDraftSchedule] = useState<ActivityScheduleDraft>(() =>
    createDefaultSchedule(initialActivities[0]?.endAt ?? `${DateTime.now().toISODate()}T00:00:00`)
  );
  const [draftReminderEmailsInput, setDraftReminderEmailsInput] = useState("");
  const [draftTitle, setDraftTitle] = useState(UI_TEXT.nb.newActivityTitle);
  const [draftColor, setDraftColor] = useState(THEME_PRESETS.nordic.ringPalette[0]?.accent ?? "#6da8c7");
  const text = useMemo(() => UI_TEXT[language], [language]);
  const reminderOffsetLabels = useMemo(
    () =>
      new Map<number, string>([
        [60 * 24 * 14, text.reminderLabel14d],
        [60 * 24 * 7, text.reminderLabel7d],
        [60 * 24 * 2, text.reminderLabel2d],
        [60 * 24, text.reminderLabel1d],
        [120, text.reminderLabel2h]
      ]),
    [text]
  );

  const theme = useMemo(() => THEME_PRESETS[themeId], [themeId]);
  const themedRings = useMemo(() => buildRingsForTheme(theme, language, ringTemplates), [theme, language, ringTemplates]);
  const activeCategorySet = useMemo(() => new Set(activeCategoryIds), [activeCategoryIds]);
  const visibleRings = useMemo(
    () => themedRings.filter((ring) => activeCategorySet.has(ring.id)),
    [activeCategorySet, themedRings]
  );
  const ringBands = useMemo(() => buildRingBands(visibleRings), [visibleRings]);

  const scale = useMemo(() => {
    return createTimeScale({
      startAt: `${startDate}T00:00:00`,
      durationMonths,
      timezone: TIMEZONE
    });
  }, [durationMonths, startDate]);

  const weekSegments = useMemo(() => buildWeekSegments(scale), [scale]);
  const monthSegments = useMemo(() => buildMonthSegments(scale, language), [language, scale]);

  const ringHitGeometries = useMemo<RingGeometry[]>(() => {
    return ringBands.map(({ ring, activityBand }) => ({
      ...activityBand,
      id: ring.id
    }));
  }, [ringBands]);

  const activityShapes = useMemo<ActivityShape[]>(() => {
    const startMs = scale.startAt.getTime();
    const endMs = scale.endAt.getTime();

    return ringBands.flatMap(({ ring, activityBand }) => {
      const ringActivities = activities
        .filter((activity) => activity.ringId === ring.id)
        .map((activity) => {
          const rawStart = parseIso(activity.startAt).toMillis();
          const rawEnd = parseIso(activity.endAt).toMillis();
          if (rawEnd <= startMs || rawStart >= endMs) {
            return null;
          }
          const visibleStart = Math.max(rawStart, startMs);
          const visibleEnd = Math.min(rawEnd, endMs);
          const startAngle = scale.timeToAngle(new Date(visibleStart));
          const endAngle = Math.max(startAngle + 0.02, scale.timeToAngle(new Date(visibleEnd)));
          return {
            ...activity,
            startAngle,
            endAngle
          };
        })
        .filter((activity): activity is ActivityModel & { startAngle: number; endAngle: number } => Boolean(activity));

      const lanes = assignActivityLanes(
        ringActivities.map((activity) => ({
          id: activity.id,
          startAngle: activity.startAngle,
          endAngle: activity.endAngle
        }))
      );

      const laneById = new Map(lanes.assignments.map((entry) => [entry.id, entry.laneIndex]));
      const laneHeight = activityBand.height / Math.max(1, lanes.laneCount);

      return ringActivities.map((activity) => {
        const laneIndex = laneById.get(activity.id) ?? 0;
        const innerRadius = activityBand.innerRadius + laneIndex * laneHeight + 1;
        const outerRadius = innerRadius + laneHeight - 2;
        return {
          ...activity,
          innerRadius,
          outerRadius
        };
      });
    });
  }, [activities, ringBands, scale]);

  const selectedActivity = useMemo(() => {
    if (!selectedActivityId) {
      return null;
    }
    return activities.find((activity) => activity.id === selectedActivityId) ?? null;
  }, [activities, selectedActivityId]);
  const normalizedFilterQuery = useMemo(() => filterQuery.trim().toLowerCase(), [filterQuery]);
  const ringLabelById = useMemo(() => new Map(themedRings.map((ring) => [ring.id, ring.label])), [themedRings]);
  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const selectedDraftTags = useMemo(
    () => draftTagIds.map((tagId) => tagById.get(tagId)).filter((tag): tag is TagModel => Boolean(tag)),
    [draftTagIds, tagById]
  );
  const activeTagKeySet = useMemo(() => new Set(activeTagKeys), [activeTagKeys]);
  const filteredActivityShapes = useMemo(() => {
    if (activeTagKeySet.size === 0) {
      return activityShapes;
    }
    return activityShapes.filter((shape) => shape.tags.some((tagId) => activeTagKeySet.has(tagId)));
  }, [activityShapes, activeTagKeySet]);
  const ringActivityCountById = useMemo(() => {
    const counts = new Map<string, number>();
    for (const shape of filteredActivityShapes) {
      counts.set(shape.ringId, (counts.get(shape.ringId) ?? 0) + 1);
    }
    return counts;
  }, [filteredActivityShapes]);
  const tagCountById = useMemo(() => {
    const counts = new Map<string, number>();
    for (const shape of activityShapes) {
      for (const tagId of shape.tags) {
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
      }
    }
    return counts;
  }, [activityShapes]);
  const tagSummary = useMemo(() => {
    const summary = new Map<string, { key: string; label: string; color: string; description: string; count: number }>();
    for (const tag of tags) {
      summary.set(tag.id, {
        key: tag.id,
        label: tag.label,
        color: tag.color,
        description: tag.description,
        count: tagCountById.get(tag.id) ?? 0
      });
    }
    for (const [tagId, count] of tagCountById) {
      if (summary.has(tagId)) {
        continue;
      }
      summary.set(tagId, {
        key: tagId,
        label: tagId,
        color: "#8ea1b8",
        description: "Auto-opprettet fra aktivitet.",
        count
      });
    }
    return [...summary.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [tags, tagCountById]);
  const filteredRingsForMenu = useMemo(() => {
    if (!normalizedFilterQuery) {
      return themedRings;
    }
    return themedRings.filter((ring) => ring.label.toLowerCase().includes(normalizedFilterQuery));
  }, [normalizedFilterQuery, themedRings]);
  const filteredTagsForMenu = useMemo(() => {
    if (!normalizedFilterQuery) {
      return tagSummary;
    }
    return tagSummary.filter(
      (tag) =>
        tag.label.toLowerCase().includes(normalizedFilterQuery) ||
        tag.description.toLowerCase().includes(normalizedFilterQuery)
    );
  }, [normalizedFilterQuery, tagSummary]);
  const filteredActivitySummary = useMemo(() => {
    const summary = new Map<string, { id: string; title: string; color: string; count: number }>();
    for (const shape of filteredActivityShapes) {
      const ringLabel = ringLabelById.get(shape.ringId) ?? "";
      const hasMatchingTag = shape.tags.some((tagId) => {
        const tagLabel = tagById.get(tagId)?.label ?? tagId;
        return tagLabel.toLowerCase().includes(normalizedFilterQuery);
      });
      const queryMatches =
        !normalizedFilterQuery ||
        shape.title.toLowerCase().includes(normalizedFilterQuery) ||
        ringLabel.toLowerCase().includes(normalizedFilterQuery) ||
        hasMatchingTag;
      if (!queryMatches) {
        continue;
      }
      const key = shape.title.toLowerCase();
      const current = summary.get(key);
      if (current) {
        current.count += 1;
      } else {
        summary.set(key, {
          id: key,
          title: shape.title,
          color: shape.color,
          count: 1
        });
      }
    }

    return [...summary.values()]
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
      .slice(0, 12);
  }, [filteredActivityShapes, normalizedFilterQuery, ringLabelById, tagById]);
  const tooltipActivity = useMemo(() => {
    if (!activityTooltip) {
      return null;
    }
    return activities.find((activity) => activity.id === activityTooltip.activityId) ?? null;
  }, [activities, activityTooltip]);
  const tooltipCategoryLabel = tooltipActivity ? ringLabelById.get(tooltipActivity.ringId) ?? tooltipActivity.ringId : "";
  const tooltipTagsLabel = tooltipActivity
    ? tooltipActivity.tags.map((tagId) => tagById.get(tagId)?.label ?? tagId).join(", ")
    : "";
  const tooltipStartLabel = tooltipActivity
    ? formatDateForLanguage(parseIso(tooltipActivity.startAt), language)
    : "";
  const tooltipEndLabel = tooltipActivity
    ? formatDateForLanguage(parseIso(tooltipActivity.endAt), language)
    : "";
  const scheduleSummaryLabel = useMemo(() => {
    if (!draftSchedule.isEnabled || draftSchedule.cadence === "NONE") {
      return text.scheduleSummaryNone;
    }

    const cadenceLabel =
      draftSchedule.cadence === "DAILY"
        ? text.scheduleCadenceDaily
        : draftSchedule.cadence === "WEEKLY"
          ? text.scheduleCadenceWeekly
          : draftSchedule.cadence === "MONTHLY"
            ? text.scheduleCadenceMonthly
            : text.scheduleCadenceOnce;
    const deadline = DateTime.fromISO(draftSchedule.deadlineAt, { zone: TIMEZONE });
    const deadlineLabel = deadline.isValid ? formatDateForLanguage(deadline, language) : draftSchedule.deadlineAt;
    const offsets = draftSchedule.reminderOffsetsMinutes
      .map((offset) => reminderOffsetLabels.get(offset) ?? `${offset}m`)
      .join(", ");
    return `${text.scheduleSummaryPrefix}: ${cadenceLabel}, ${deadlineLabel}${offsets ? ` (${offsets})` : ""}`;
  }, [draftSchedule, language, reminderOffsetLabels, text]);

  const visibleStart = DateTime.fromJSDate(scale.startAt, { zone: TIMEZONE });
  const visibleEnd = DateTime.fromJSDate(scale.endAt, { zone: TIMEZONE }).minus({ days: 1 });
  const jumpOptions = useMemo<WindowJumpOption[]>(() => {
    const current = DateTime.fromISO(startDate, { zone: TIMEZONE }).startOf("day");
    const byStartDate = new Map<string, WindowJumpOption>();

    function pushOption(date: DateTime, label: string) {
      const value = date.toISODate();
      if (!value) {
        return;
      }
      byStartDate.set(value, { value, label });
    }

    if (windowAnchorMode === "manual") {
      for (let offset = -16; offset <= 16; offset += 1) {
        const weekStart = current.plus({ weeks: offset }).startOf("day");
        pushOption(weekStart, `${text.weekPrefix} ${weekStart.weekNumber}, ${weekStart.weekYear}`);
      }
      return [...byStartDate.values()];
    }

    if (durationMonths === 12) {
      for (let offset = -6; offset <= 6; offset += 1) {
        const yearStart = DateTime.fromObject({ year: current.year + offset, month: 1, day: 1 }, { zone: TIMEZONE });
        pushOption(yearStart, String(yearStart.year));
      }
      return [...byStartDate.values()];
    }

    if (durationMonths === 6) {
      for (let offset = -6; offset <= 6; offset += 1) {
        const candidate = current.plus({ months: offset * 6 });
        const month = candidate.month >= 7 ? 7 : 1;
        const halfStart = DateTime.fromObject({ year: candidate.year, month, day: 1 }, { zone: TIMEZONE });
        const halfLabel = month === 1 ? "H1" : "H2";
        pushOption(halfStart, `${halfStart.year} ${halfLabel}`);
      }
      return [...byStartDate.values()];
    }

    for (let offset = -8; offset <= 8; offset += 1) {
      const candidate = current.plus({ months: offset * 3 });
      const quarterStartMonth = Math.floor((candidate.month - 1) / 3) * 3 + 1;
      const quarterStart = DateTime.fromObject(
        { year: candidate.year, month: quarterStartMonth, day: 1 },
        { zone: TIMEZONE }
      );
      const quarter = Math.floor((quarterStart.month - 1) / 3) + 1;
      pushOption(quarterStart, `${quarterStart.year} ${text.quarterPrefix}${quarter}`);
    }

    return [...byStartDate.values()];
  }, [durationMonths, startDate, text.quarterPrefix, text.weekPrefix, windowAnchorMode]);

  const azureCallbackUri = useMemo(() => {
    if (typeof window === "undefined") {
      return "http://localhost:3001/api/auth/callback/azure-ad";
    }
    const base = window.location.origin.replace(/\/+$/, "");
    return `${base}/api/auth/callback/azure-ad`;
  }, []);
  const currentUserIsSystemAdmin = Boolean(session?.user?.isSystemAdmin);
  const activeTenantId = session?.user?.activeTenantId ?? null;
  const currentUserIsTenantAdmin = useMemo(() => {
    if (!activeTenantId) {
      return false;
    }
    return userTenants.some((membership) => membership.tenantId === activeTenantId && membership.role === "ADMIN");
  }, [userTenants, activeTenantId]);
  const canUseAdminSetup = currentUserIsTenantAdmin;
  const currentRoleLabel = useMemo(() => {
    if (currentUserIsSystemAdmin && currentUserIsTenantAdmin) {
      return `${text.roleSystemAdmin} + ${text.roleTenantAdmin}`;
    }
    if (currentUserIsSystemAdmin) {
      return text.roleSystemAdmin;
    }
    if (currentUserIsTenantAdmin) {
      return text.roleTenantAdmin;
    }
    if (activeTenantId) {
      return text.roleTenantMember;
    }
    return text.roleNoTenant;
  }, [
    activeTenantId,
    currentUserIsSystemAdmin,
    currentUserIsTenantAdmin,
    text.roleNoTenant,
    text.roleSystemAdmin,
    text.roleTenantAdmin,
    text.roleTenantMember
  ]);
  const selectedLoginTenant = useMemo(
    () => loginTenants.find((tenant) => tenant.id === loginTenantId) ?? loginTenants[0] ?? null,
    [loginTenantId, loginTenants]
  );
  const hasLoginTenantSelection = loginTenants.length > 0 && Boolean(selectedLoginTenant);
  const localProviderEnabled = hasLoginTenantSelection ? selectedLoginTenant?.allowLocalAuth === true : false;
  const azureProviderEnabled =
    hasLoginTenantSelection && hasAzureAuth
      ? selectedLoginTenant?.allowAzureAuth === true && selectedLoginTenant?.azureConfigured === true
      : false;
  const activeTenant = useMemo(
    () => userTenants.find((membership) => membership.tenantId === activeTenantId)?.tenant ?? null,
    [userTenants, activeTenantId]
  );
  const activeAdminTenant = useMemo(
    () => adminTenants.find((tenant) => tenant.id === activeAdminTenantId) ?? null,
    [adminTenants, activeAdminTenantId]
  );
  const filteredAdminUsers = useMemo(() => {
    const query = userAdminFilterQuery.trim().toLowerCase();
    return adminUsers.filter((user) => {
      const matchesQuery =
        query.length === 0 ||
        user.name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query);
      const matchesRole =
        userAdminFilterRole === "ALL" ||
        (userAdminFilterRole === "ADMIN" ? user.isAdmin : !user.isAdmin);
      const matchesStatus =
        userAdminFilterStatus === "ALL" ||
        (userAdminFilterStatus === "ACTIVE" ? !user.isDisabled : user.isDisabled);
      return Boolean(matchesQuery && matchesRole && matchesStatus);
    });
  }, [adminUsers, userAdminFilterQuery, userAdminFilterRole, userAdminFilterStatus]);

  async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    const response = await fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...(init?.body ? { "Content-Type": "application/json" } : {})
      }
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = isObject(payload) && typeof payload.error === "string" ? payload.error : `${response.status}`;
      throw new Error(message);
    }

    return payload as T;
  }

  async function applyActiveTenant(nextTenantId: string, options?: { persist?: boolean; closeChooser?: boolean }) {
    const normalizedTenantId = nextTenantId.trim();
    if (!normalizedTenantId) {
      return;
    }

    try {
      setIsSwitchingTenant(true);
      setTenantScopeError("");
      setLoadError("");
      const updated = await update({
        activeTenantId: normalizedTenantId
      });
      const resolvedActiveTenantId = updated?.user?.activeTenantId ?? null;
      if (resolvedActiveTenantId !== normalizedTenantId) {
        throw new Error("Could not activate selected tenant.");
      }

      if (options?.persist !== false) {
        window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, normalizedTenantId);
      }
      if (options?.closeChooser !== false) {
        setIsTenantChooserOpen(false);
      }
      setTenantChooserId("");
      loadedWheelIdRef.current = null;
      setActiveWheelId(null);
      setShares([]);
      setActivities([]);
    } catch (error) {
      setTenantScopeError(error instanceof Error ? error.message : "Could not switch tenant.");
    } finally {
      setIsSwitchingTenant(false);
    }
  }

  async function loadUserTenants() {
    if (status !== "authenticated") {
      return;
    }

    const payload = await requestJson<{ activeTenantId: string | null; tenants: UserTenantMembershipModel[] }>("/api/tenants");
    const memberships = payload.tenants ?? [];
    setUserTenants(memberships);

    if (memberships.length === 0) {
      setTenantScopeError("No tenant memberships found for this account.");
      return;
    }

    const membershipIds = new Set(memberships.map((membership) => membership.tenantId));
    const sessionTenantId = payload.activeTenantId ?? activeTenantId;
    const storedTenantId = window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)?.trim() || "";

    if (memberships.length === 1) {
      const onlyTenantId = memberships[0]!.tenantId;
      if (sessionTenantId !== onlyTenantId) {
        await applyActiveTenant(onlyTenantId, { persist: true, closeChooser: true });
        return;
      }
      window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, onlyTenantId);
      setIsTenantChooserOpen(false);
      return;
    }

    if (storedTenantId && membershipIds.has(storedTenantId) && sessionTenantId !== storedTenantId) {
      await applyActiveTenant(storedTenantId, { persist: true, closeChooser: true });
      return;
    }

    const hasValidSessionTenant = Boolean(sessionTenantId && membershipIds.has(sessionTenantId));
    if (!hasValidSessionTenant) {
      const firstTenantId = memberships[0]!.tenantId;
      await applyActiveTenant(firstTenantId, { persist: true, closeChooser: true });
      return;
    }

    if (!storedTenantId && !tenantBootstrapRef.current) {
      tenantBootstrapRef.current = true;
      setTenantChooserId(sessionTenantId!);
      setIsTenantChooserOpen(true);
    }
  }

  async function createWheel(title?: string) {
    const wheelTitle = title?.trim() || text.wheelCreateDefaultTitle;
    const today = DateTime.now().setZone(TIMEZONE);
    const defaultDuration: 12 = 12;
    const alignedStart = alignedWindowStart(today, defaultDuration).toISODate() ?? today.toISODate() ?? "2026-01-01";
    const defaultAccent = THEME_PRESETS[themeId].ringPalette[0]?.accent ?? "#6da8c7";
    const defaultRing = createDefaultRingTemplate(language, defaultAccent);
    const created = await requestJson<{ wheel: WheelSummary }>("/api/wheels", {
      method: "POST",
      body: JSON.stringify({
        title: wheelTitle,
        timezone: TIMEZONE,
        startDate: `${alignedStart}T00:00:00`,
        durationMonths: defaultDuration,
        config: {
          ringTemplates: [defaultRing],
          tags: INITIAL_TAGS,
          themeId,
          language,
          seamShadowEnabled,
          windowAnchorMode
        } satisfies WheelConfigModel
      })
    });
    return created.wheel;
  }

  async function loadWheelsList(preferredWheelId?: string) {
    const payload = await requestJson<{ wheels: WheelSummary[] }>("/api/wheels");
    const fetched = payload.wheels ?? [];
    let nextWheels = fetched;
    if (fetched.length === 0) {
      const created = await createWheel();
      nextWheels = [created];
    }
    setWheels(nextWheels);
    setActiveWheelId((previous) => {
      if (preferredWheelId && nextWheels.some((wheel) => wheel.id === preferredWheelId)) {
        return preferredWheelId;
      }
      if (previous && nextWheels.some((wheel) => wheel.id === previous)) {
        return previous;
      }
      return nextWheels[0]?.id ?? null;
    });
  }

  async function loadShares(wheelId: string) {
    try {
      const payload = await requestJson<{ shares: ShareEntry[] }>(`/api/wheels/${wheelId}/share`);
      setShares(payload.shares ?? []);
    } catch {
      setShares([]);
    }
  }

  async function loadShareableUsers() {
    if (status !== "authenticated" || !activeTenantId) {
      setShareableUsers([]);
      setShareUserSelectionEmail("");
      setShareUserEmail("");
      return;
    }

    try {
      const payload = await requestJson<{ users: ShareableUserOptionModel[] }>("/api/tenant/users");
      const nextUsers = payload.users ?? [];
      setShareableUsers(nextUsers);
      setShareUserSelectionEmail((previous) => {
        if (previous && nextUsers.some((user) => user.email === previous)) {
          setShareUserEmail(previous);
          return previous;
        }
        const firstEmail = nextUsers[0]?.email ?? "";
        setShareUserEmail(firstEmail);
        return firstEmail;
      });
    } catch {
      setShareableUsers([]);
      setShareUserSelectionEmail("");
      setShareUserEmail("");
    }
  }

  async function loadWheelData(wheelId: string) {
    setIsHydratingWheel(true);
    isHydratingRef.current = true;
    loadedWheelIdRef.current = null;
    setLoadError("");
    let loaded = false;
    try {
      const [wheelPayload, activitiesPayload] = await Promise.all([
        requestJson<{ wheel: WheelSummary }>(`/api/wheels/${wheelId}`),
        requestJson<{ activities: ApiActivity[] }>(`/api/wheels/${wheelId}/activities`)
      ]);

      const wheel = wheelPayload.wheel;
      const parsedConfig = parseWheelConfig(wheel.config);
      const nextRingTemplates = parsedConfig.ringTemplates && parsedConfig.ringTemplates.length > 0 ? parsedConfig.ringTemplates : RING_TEMPLATES;
      const nextTags = parsedConfig.tags && parsedConfig.tags.length > 0 ? parsedConfig.tags : INITIAL_TAGS;
      const nextStart = DateTime.fromISO(wheel.startDate, { zone: TIMEZONE }).toISODate() ?? startDate;

      setRingTemplates(nextRingTemplates);
      setTags(nextTags);
      setLanguage(parsedConfig.language ?? "nb");
      setThemeId(parsedConfig.themeId ?? "nordic");
      setSeamShadowEnabled(parsedConfig.seamShadowEnabled ?? true);
      setWindowAnchorMode(parsedConfig.windowAnchorMode ?? "dynamic_today");
      setDurationMonths(12);
      setStartDate(nextStart);
      setActiveCategoryIds(nextRingTemplates.map((ring) => ring.id));
      setActiveTagKeys([]);
      setActivities((activitiesPayload.activities ?? []).map(normalizeActivityFromApi));
      setSelectedActivityId(null);
      setSelectedSlot(null);
      await loadShares(wheelId);
      loaded = true;
    } catch {
      setLoadError(text.wheelLoadFailed);
      setActivities([]);
    } finally {
      if (loaded) {
        loadedWheelIdRef.current = wheelId;
      }
      setIsHydratingWheel(false);
      isHydratingRef.current = false;
    }
  }

  function shiftWindow(direction: -1 | 1) {
    const current = DateTime.fromISO(startDate, { zone: TIMEZONE });
    const shifted = current.plus({ months: direction * durationMonths });
    setStartDate(shifted.toISODate() ?? startDate);
    setSelectedSlot(null);
    setSelectedActivityId(null);
  }

  function jumpToWindow(nextStartDate: string) {
    if (!nextStartDate || nextStartDate === startDate) {
      return;
    }
    setStartDate(nextStartDate);
    setSelectedSlot(null);
    setSelectedActivityId(null);
  }

  async function createWheelFromUi() {
    try {
      setIsWheelBusy(true);
      const proposed = window.prompt(text.wheelCreatePrompt, text.wheelCreateDefaultTitle);
      if (proposed === null) {
        return;
      }
      const created = await createWheel(proposed);
      await loadWheelsList(created.id);
      setActiveWheelId(created.id);
    } catch {
      setLoadError(text.wheelLoadFailed);
    } finally {
      setIsWheelBusy(false);
    }
  }

  function openWheelRenameDialog(wheelId: string) {
    const currentTitle = wheels.find((wheel) => wheel.id === wheelId)?.title?.trim() || text.wheelCreateDefaultTitle;
    setWheelRenameId(wheelId);
    setWheelRenameDraft(currentTitle);
    setIsWheelRenameDialogOpen(true);
  }

  function closeWheelRenameDialog() {
    setIsWheelRenameDialogOpen(false);
    setWheelRenameId(null);
    setWheelRenameDraft("");
  }

  async function saveWheelRenameFromUi() {
    if (!wheelRenameId) {
      return;
    }

    const currentTitle = wheels.find((wheel) => wheel.id === wheelRenameId)?.title?.trim() || text.wheelCreateDefaultTitle;
    const nextTitle = wheelRenameDraft.trim();
    if (!nextTitle) {
      return;
    }
    if (nextTitle === currentTitle) {
      closeWheelRenameDialog();
      return;
    }

    try {
      setIsWheelBusy(true);
      setSaveError("");
      const payload = await requestJson<{ wheel: WheelSummary }>(`/api/wheels/${wheelRenameId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: nextTitle
        })
      });
      setWheels((prev) => prev.map((wheel) => (wheel.id === payload.wheel.id ? { ...wheel, ...payload.wheel } : wheel)));
      closeWheelRenameDialog();
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : text.wheelSaveFailed);
    } finally {
      setIsWheelBusy(false);
    }
  }

  async function deleteWheelFromUi(wheelId: string) {
    if (!wheelId) {
      return;
    }

    const confirmed = window.confirm(text.deleteWheelConfirm);
    if (!confirmed) {
      return;
    }

    try {
      setIsWheelBusy(true);
      setSaveError("");
      await requestJson<{ removed: number }>(`/api/wheels/${wheelId}`, {
        method: "DELETE"
      });
      const preferredWheelId = activeWheelId && activeWheelId !== wheelId ? activeWheelId : undefined;
      if (activeWheelId === wheelId) {
        setActiveWheelId(null);
      }
      if (wheelRenameId === wheelId) {
        closeWheelRenameDialog();
      }
      await loadWheelsList(preferredWheelId);
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : text.wheelSaveFailed);
    } finally {
      setIsWheelBusy(false);
    }
  }

  async function shareWithUser() {
    const selectedEmail = (shareUserSelectionEmail || shareUserEmail).trim();
    if (!activeWheelId || !selectedEmail) {
      return;
    }
    try {
      setIsSharingBusy(true);
      setSaveError("");
      await requestJson<{ share: ShareEntry }>(`/api/wheels/${activeWheelId}/share`, {
        method: "POST",
        body: JSON.stringify({
          targetType: "USER",
          role: shareRole,
          userEmail: selectedEmail
        })
      });
      setShareUserSelectionEmail("");
      setShareUserEmail("");
      await loadShareableUsers();
      await loadShares(activeWheelId);
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : text.wheelSaveFailed);
    } finally {
      setIsSharingBusy(false);
    }
  }

  async function shareWithGroup() {
    if (!activeWheelId || !shareGroupId.trim()) {
      return;
    }
    try {
      setIsSharingBusy(true);
      setSaveError("");
      await requestJson<{ share: ShareEntry }>(`/api/wheels/${activeWheelId}/share`, {
        method: "POST",
        body: JSON.stringify({
          targetType: "AAD_GROUP",
          role: shareRole,
          tenantGroupId: shareGroupId.trim()
        })
      });
      setShareGroupId("");
      await loadShares(activeWheelId);
    } catch {
      setSaveError(text.wheelSaveFailed);
    } finally {
      setIsSharingBusy(false);
    }
  }

  async function removeShare(entry: ShareEntry) {
    if (!activeWheelId) {
      return;
    }
    try {
      setIsSharingBusy(true);
      setSaveError("");
      if (entry.targetType === "USER") {
        const email = entry.user?.email?.trim();
        if (!email) {
          return;
        }
        await requestJson<{ removed: number }>(
          `/api/wheels/${activeWheelId}/share?targetType=USER&userEmail=${encodeURIComponent(email)}`,
          { method: "DELETE" }
        );
      } else {
        const tenantGroupId = entry.group?.tenantGroupId?.trim();
        if (!tenantGroupId) {
          return;
        }
        await requestJson<{ removed: number }>(
          `/api/wheels/${activeWheelId}/share?targetType=AAD_GROUP&tenantGroupId=${encodeURIComponent(tenantGroupId)}`,
          { method: "DELETE" }
        );
      }
      await loadShares(activeWheelId);
    } catch {
      setSaveError(text.wheelSaveFailed);
    } finally {
      setIsSharingBusy(false);
    }
  }

  async function loadAdminTenantSettings(tenantId: string) {
    if (!tenantId) {
      setAdminTenantSettings(null);
      setAzureTenantId("");
      setAzureClientId("");
      setAzureClientSecret("");
      setSmtpHost("");
      setSmtpPort("587");
      setSmtpSecure(false);
      setSmtpUser("");
      setSmtpPass("");
      setSmtpFrom("");
      setSmtpReplyTo("");
      setSmtpTestTo("");
      setSmtpNotice("");
      return;
    }

    const payload = await requestJson<{ settings: AdminTenantSettingsModel }>(
      `/api/admin/tenant?tenantId=${encodeURIComponent(tenantId)}`
    );
    const settings = payload.settings;
    setAdminTenantSettings(settings);
    setAzureTenantId(settings.azureTenantId ?? "");
    setAzureClientId(settings.azureClientId ?? "");
    setAzureClientSecret(settings.azureClientSecret ?? "");
    setSmtpHost(settings.smtpHost ?? "");
    setSmtpPort(settings.smtpPort ? String(settings.smtpPort) : "");
    setSmtpSecure(settings.smtpSecure ?? false);
    setSmtpUser(settings.smtpUser ?? "");
    setSmtpPass(settings.smtpPass ?? "");
    setSmtpFrom(settings.smtpFrom ?? "");
    setSmtpReplyTo(settings.smtpReplyTo ?? "");
    setSmtpTestTo((session?.user?.email ?? settings.supportEmail ?? "").trim());
    setSmtpNotice("");
  }

  async function saveAzureSetupForTenant() {
    if (!canUseAdminSetup || !activeAdminTenantId) {
      return;
    }

    try {
      setIsAzureSetupSaving(true);
      const payload = await requestJson<{ settings: AdminTenantSettingsModel }>(
        `/api/admin/tenant?tenantId=${encodeURIComponent(activeAdminTenantId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            allowAzureAuth: true,
            azureTenantId: azureTenantId.trim(),
            azureClientId: azureClientId.trim(),
            azureClientSecret: azureClientSecret.trim()
          })
        }
      );
      setAdminTenantSettings(payload.settings);
      setAzureCopyNotice(text.azureEnvCopied);
    } catch {
      setAzureCopyNotice(text.wheelSaveFailed);
    } finally {
      setIsAzureSetupSaving(false);
    }
  }

  async function saveSmtpSetupForTenant() {
    if (!canUseAdminSetup || !activeAdminTenantId) {
      return;
    }

    try {
      setIsSmtpSaving(true);
      setAdminError("");
      setSmtpNotice("");
      const payload = await requestJson<{ settings: AdminTenantSettingsModel }>(
        `/api/admin/tenant?tenantId=${encodeURIComponent(activeAdminTenantId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            smtpHost: smtpHost.trim(),
            smtpPort: smtpPort.trim(),
            smtpSecure,
            smtpUser: smtpUser.trim(),
            smtpPass: smtpPass.trim(),
            smtpFrom: smtpFrom.trim(),
            smtpReplyTo: smtpReplyTo.trim()
          })
        }
      );
      const settings = payload.settings;
      setAdminTenantSettings(settings);
      setSmtpHost(settings.smtpHost ?? "");
      setSmtpPort(settings.smtpPort ? String(settings.smtpPort) : "");
      setSmtpSecure(settings.smtpSecure ?? false);
      setSmtpUser(settings.smtpUser ?? "");
      setSmtpPass(settings.smtpPass ?? "");
      setSmtpFrom(settings.smtpFrom ?? "");
      setSmtpReplyTo(settings.smtpReplyTo ?? "");
      setSmtpNotice(text.smtpSaved);
    } catch (error) {
      setAdminError(error instanceof Error && error.message ? error.message : text.wheelSaveFailed);
    } finally {
      setIsSmtpSaving(false);
    }
  }

  async function sendSmtpTestEmail() {
    if (!canUseAdminSetup || !activeAdminTenantId || !smtpTestTo.trim()) {
      return;
    }

    try {
      setIsSmtpTesting(true);
      setAdminError("");
      setSmtpNotice("");
      await requestJson<{ sent: boolean; to: string }>(`/api/admin/tenant/test-email?tenantId=${encodeURIComponent(activeAdminTenantId)}`, {
        method: "POST",
        body: JSON.stringify({
          to: smtpTestTo.trim(),
          smtpHost: smtpHost.trim(),
          smtpPort: smtpPort.trim(),
          smtpSecure,
          smtpUser: smtpUser.trim(),
          smtpPass: smtpPass.trim(),
          smtpFrom: smtpFrom.trim(),
          smtpReplyTo: smtpReplyTo.trim()
        })
      });
      setSmtpNotice(text.smtpTestSent);
    } catch (error) {
      setAdminError(error instanceof Error && error.message ? error.message : text.wheelSaveFailed);
    } finally {
      setIsSmtpTesting(false);
    }
  }

  async function loadAdminTenantContext(tenantId: string) {
    if (!tenantId) {
      setAdminUsers([]);
      setEditingAdminUserId(null);
      return;
    }

    const usersPayload = await requestJson<{ users: AdminUserModel[] }>(
      `/api/admin/users?tenantId=${encodeURIComponent(tenantId)}`
    );
    const nextUsers = usersPayload.users ?? [];
    setAdminUsers(nextUsers);
    if (editingAdminUserId) {
      const refreshed = nextUsers.find((user) => user.id === editingAdminUserId);
      if (refreshed) {
        setEditingAdminUserName(refreshed.name ?? "");
        setEditingAdminUserEmail(refreshed.email ?? "");
        setEditingAdminUserIsAdmin(refreshed.isAdmin);
        setEditingAdminUserIsDisabled(refreshed.isDisabled);
      } else {
        setEditingAdminUserId(null);
        setEditingAdminUserName("");
        setEditingAdminUserEmail("");
        setEditingAdminUserPassword("");
        setEditingAdminUserIsAdmin(false);
        setEditingAdminUserIsDisabled(false);
      }
    }
  }

  async function loadAdminData() {
    if (!canUseAdminSetup) {
      return;
    }

    try {
      setIsAdminLoading(true);
      setAdminError("");
      const tenantsPayload = await requestJson<{ tenants: AdminTenantOptionModel[] }>("/api/admin/tenants");
      const tenantOptions = tenantsPayload.tenants ?? [];
      setAdminTenants(tenantOptions);
      const preferredTenantId = tenantOptions.some((tenant) => tenant.id === activeAdminTenantId)
        ? activeAdminTenantId
        : tenantOptions.some((tenant) => tenant.id === activeTenantId)
          ? (activeTenantId ?? "")
          : (tenantOptions[0]?.id ?? "");
      setActiveAdminTenantId(preferredTenantId);

      if (!preferredTenantId) {
        setAdminUsers([]);
        setAdminOverview(null);
        await loadAdminTenantSettings("");
        setAdminError(text.adminTenantUnavailable);
        return;
      }

      const [overviewPayload] = await Promise.all([
        requestJson<{ overview: AdminOverviewModel }>(
          `/api/admin/overview?tenantId=${encodeURIComponent(preferredTenantId)}`
        ),
        loadAdminTenantContext(preferredTenantId),
        loadAdminTenantSettings(preferredTenantId)
      ]);
      setAdminOverview(overviewPayload.overview);
    } catch {
      setAdminError(text.adminLoadFailed);
    } finally {
      setIsAdminLoading(false);
    }
  }

  function openAdminUserEditor(user: AdminUserModel) {
    setAdminUserEditorMode("edit");
    setEditingAdminUserId(user.id);
    setEditingAdminUserName(user.name ?? "");
    setEditingAdminUserEmail(user.email ?? "");
    setEditingAdminUserPassword("");
    setEditingAdminUserIsAdmin(user.isAdmin);
    setEditingAdminUserIsDisabled(user.isDisabled);
  }

  function openCreateAdminUserEditor() {
    setAdminUserEditorMode("create");
    setEditingAdminUserId(null);
    setEditingAdminUserName("");
    setEditingAdminUserEmail("");
    setEditingAdminUserPassword("");
    setEditingAdminUserIsAdmin(false);
    setEditingAdminUserIsDisabled(false);
  }

  function closeAdminUserEditor() {
    setAdminUserEditorMode(null);
    setEditingAdminUserId(null);
    setEditingAdminUserName("");
    setEditingAdminUserEmail("");
    setEditingAdminUserPassword("");
    setEditingAdminUserIsAdmin(false);
    setEditingAdminUserIsDisabled(false);
  }

  async function refreshAdminOverviewForTenant(tenantId: string) {
    const payload = await requestJson<{ overview: AdminOverviewModel }>(
      `/api/admin/overview?tenantId=${encodeURIComponent(tenantId)}`
    );
    setAdminOverview(payload.overview);
  }

  async function saveTenantUserEdits() {
    if (!canUseAdminSetup || !activeAdminTenantId || !adminUserEditorMode) {
      return;
    }

    try {
      setIsAdminUserSaving(true);
      setAdminError("");

      if (adminUserEditorMode === "create") {
        await requestJson<{ user: AdminUserModel }>(`/api/admin/users?tenantId=${encodeURIComponent(activeAdminTenantId)}`, {
          method: "POST",
          body: JSON.stringify({
            name: editingAdminUserName.trim(),
            email: editingAdminUserEmail.trim().toLowerCase(),
            password: editingAdminUserPassword,
            isAdmin: editingAdminUserIsAdmin
          })
        });
      } else if (editingAdminUserId) {
        await requestJson<{ user: AdminUserModel }>(
          `/api/admin/users/${editingAdminUserId}?tenantId=${encodeURIComponent(activeAdminTenantId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: editingAdminUserName.trim(),
              email: editingAdminUserEmail.trim().toLowerCase(),
              password: editingAdminUserPassword,
              isAdmin: editingAdminUserIsAdmin,
              isDisabled: editingAdminUserIsDisabled
            })
          }
        );
      }

      setEditingAdminUserPassword("");
      if (adminUserEditorMode === "create") {
        closeAdminUserEditor();
      }
      await Promise.all([loadAdminTenantContext(activeAdminTenantId), refreshAdminOverviewForTenant(activeAdminTenantId)]);
    } catch (error) {
      setAdminError(error instanceof Error && error.message ? error.message : text.wheelSaveFailed);
    } finally {
      setIsAdminUserSaving(false);
    }
  }

  async function toggleTenantUserDisabled(user: AdminUserModel) {
    if (!canUseAdminSetup || !activeAdminTenantId) {
      return;
    }

    try {
      setIsAdminUserSaving(true);
      setAdminError("");
      await requestJson<{ user: AdminUserModel }>(
        `/api/admin/users/${user.id}?tenantId=${encodeURIComponent(activeAdminTenantId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            isDisabled: !user.isDisabled
          })
        }
      );
      await Promise.all([loadAdminTenantContext(activeAdminTenantId), refreshAdminOverviewForTenant(activeAdminTenantId)]);
    } catch (error) {
      setAdminError(error instanceof Error && error.message ? error.message : text.wheelSaveFailed);
    } finally {
      setIsAdminUserSaving(false);
    }
  }

  async function deleteTenantUser(user: AdminUserModel) {
    if (!canUseAdminSetup || !activeAdminTenantId) {
      return;
    }
    if (!window.confirm(text.adminDeleteUserConfirm)) {
      return;
    }

    try {
      setIsAdminUserSaving(true);
      setAdminError("");
      await requestJson<{ removed: number; deletedUser: boolean }>(
        `/api/admin/users/${user.id}?tenantId=${encodeURIComponent(activeAdminTenantId)}`,
        {
          method: "DELETE"
        }
      );
      if (editingAdminUserId === user.id) {
        closeAdminUserEditor();
      }
      await Promise.all([loadAdminTenantContext(activeAdminTenantId), refreshAdminOverviewForTenant(activeAdminTenantId)]);
    } catch (error) {
      setAdminError(error instanceof Error && error.message ? error.message : text.wheelSaveFailed);
    } finally {
      setIsAdminUserSaving(false);
    }
  }

  async function onSubmitLocalAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLoginTenant) {
      setLocalAuthError(text.loginTenantUnavailable);
      return;
    }
    const email = localEmail.trim().toLowerCase();
    const password = localPassword;
    const name = localName.trim();

    if (!email || !password) {
      setLocalAuthError(localAuthMode === "login" ? text.localAuthFailed : text.localRegisterFailed);
      return;
    }

    setLocalAuthBusy(true);
    setLocalAuthError("");

    try {
      const preferredTenantId = (loginTenantId || selectedLoginTenant?.id || "").trim();
      if (preferredTenantId) {
        window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, preferredTenantId);
      }

      if (localAuthMode === "register") {
        const response = await fetch("/api/auth/local/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            name,
            tenantId: preferredTenantId
          })
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setLocalAuthError(payload?.error ?? text.localRegisterFailed);
          return;
        }
      }

      const result = await signIn("credentials", {
        redirect: false,
        email,
        password
      });

      if (!result || result.error) {
        setLocalAuthError(text.localAuthFailed);
        return;
      }

      setLocalPassword("");
      if (localAuthMode === "register") {
        setLocalName("");
      }
    } catch {
      setLocalAuthError(localAuthMode === "login" ? text.localAuthFailed : text.localRegisterFailed);
    } finally {
      setLocalAuthBusy(false);
    }
  }

  async function onAzureSignIn() {
    const preferredTenantId = (loginTenantId || selectedLoginTenant?.id || "").trim();
    if (preferredTenantId) {
      window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, preferredTenantId);
    }
    await signIn("azure-ad");
  }

  function showAllCategories() {
    setActiveCategoryIds(themedRings.map((ring) => ring.id));
  }

  function hideAllCategories() {
    setActiveCategoryIds([]);
  }

  function toggleCategory(categoryId: string) {
    setActiveCategoryIds((prev) => {
      if (prev.includes(categoryId)) {
        return prev.filter((id) => id !== categoryId);
      }
      return [...prev, categoryId];
    });
  }

  function clearTagFilters() {
    onTagHoverEnd();
    setActiveTagKeys([]);
  }

  function toggleTagFilter(tagKey: string) {
    onTagHoverEnd();
    setActiveTagKeys((prev) => {
      if (prev.includes(tagKey)) {
        return prev.filter((key) => key !== tagKey);
      }
      return [...prev, tagKey];
    });
  }

  function clearTagTooltipTimer() {
    if (tagTooltipTimerRef.current !== null) {
      window.clearTimeout(tagTooltipTimerRef.current);
      tagTooltipTimerRef.current = null;
    }
  }

  function onTagHoverStart(tag: { label: string; description: string; color: string }, event: React.MouseEvent<HTMLElement>) {
    clearTagTooltipTimer();
    setTagTooltip(null);
    if (!tag.description.trim()) {
      return;
    }
    tagTooltipPointRef.current = { x: event.clientX, y: event.clientY };
    tagTooltipTimerRef.current = window.setTimeout(() => {
      const point = tagTooltipPointRef.current;
      setTagTooltip({
        label: tag.label,
        description: tag.description,
        color: tag.color,
        x: point.x,
        y: point.y
      });
      tagTooltipTimerRef.current = null;
    }, 3000);
  }

  function onTagHoverMove(event: React.MouseEvent<HTMLElement>) {
    const point = { x: event.clientX, y: event.clientY };
    tagTooltipPointRef.current = point;
    setTagTooltip((prev) => (prev ? { ...prev, x: point.x, y: point.y } : prev));
  }

  function onTagHoverEnd() {
    clearTagTooltipTimer();
    setTagTooltip(null);
  }

  function resetTagEditor() {
    setEditingTagId(null);
    setNewTagLabel("");
    setNewTagDescription("");
    setNewTagColor("#5a8fc1");
  }

  function openTagDialog() {
    onTagHoverEnd();
    setIsScheduleDialogOpen(false);
    resetTagEditor();
    setIsTagDialogOpen(true);
  }

  function closeTagDialog() {
    onTagHoverEnd();
    resetTagEditor();
    setIsTagDialogOpen(false);
  }

  function openScheduleDialog() {
    onTagHoverEnd();
    setIsTagDialogOpen(false);
    setDraftReminderEmailsInput(draftSchedule.reminderEmails.join(", "));
    setIsScheduleDialogOpen(true);
  }

  function closeScheduleDialog() {
    setIsScheduleDialogOpen(false);
  }

  function toggleReminderOffset(offsetMinutes: number) {
    setDraftSchedule((prev) => {
      const next = prev.reminderOffsetsMinutes.includes(offsetMinutes)
        ? prev.reminderOffsetsMinutes.filter((entry) => entry !== offsetMinutes)
        : [...prev.reminderOffsetsMinutes, offsetMinutes];
      return {
        ...prev,
        reminderOffsetsMinutes: [...new Set(next)].sort((a, b) => a - b)
      };
    });
  }

  function saveScheduleDialog() {
    const reminderEmails = [...new Set(draftReminderEmailsInput.split(",").map((entry) => entry.trim()).filter(Boolean))];
    setDraftSchedule((prev) => ({
      ...prev,
      reminderEmails
    }));
    setIsScheduleDialogOpen(false);
  }

  function openEditTag(tagId: string) {
    const currentTag = tags.find((tag) => tag.id === tagId);
    if (!currentTag) {
      return;
    }
    onTagHoverEnd();
    setEditingTagId(currentTag.id);
    setNewTagLabel(currentTag.label);
    setNewTagDescription(currentTag.description);
    setNewTagColor(normalizeHexColor(currentTag.color));
  }

  async function deleteTag(tagId: string) {
    const currentTag = tags.find((tag) => tag.id === tagId);
    if (!currentTag) {
      return;
    }

    const confirmed = window.confirm(`${text.deleteTag}: "${currentTag.label}"?`);
    if (!confirmed) {
      return;
    }

    onTagHoverEnd();
    const affectedActivities = activities.filter((activity) => activity.tags.includes(tagId));
    setTags((prev) => prev.filter((tag) => tag.id !== tagId));
    setActivities((prev) =>
      prev.map((activity) =>
        activity.tags.includes(tagId)
          ? {
              ...activity,
              tags: activity.tags.filter((id) => id !== tagId)
            }
          : activity
      )
    );
    setDraftTagIds((prev) => prev.filter((id) => id !== tagId));
    setActiveTagKeys((prev) => prev.filter((key) => key !== tagId));

    if (editingTagId === tagId) {
      resetTagEditor();
    }

    if (!activeWheelId || affectedActivities.length === 0) {
      return;
    }

    try {
      setSaveError("");
      await Promise.all(
        affectedActivities.map((activity) =>
          requestJson<{ activity: ApiActivity }>(`/api/activities/${activity.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              tags: activity.tags.filter((id) => id !== tagId)
            })
          })
        )
      );
    } catch {
      setSaveError(text.wheelSaveFailed);
    }
  }

  function toggleDraftTag(tagId: string) {
    setDraftTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      }
      return [...prev, tagId];
    });
  }

  function addNewTagFromDialog() {
    const label = newTagLabel.trim().replace(/\s+/g, " ");
    const description = newTagDescription.trim().replace(/\s+/g, " ");
    if (!label || !description) {
      return;
    }

    if (editingTagId) {
      setTags((prev) =>
        prev.map((tag) =>
          tag.id === editingTagId
            ? {
                ...tag,
                label,
                description,
                color: normalizeHexColor(newTagColor)
              }
            : tag
        )
      );
      resetTagEditor();
      return;
    }

    const baseId = slugifyTagId(label) || "tag";
    const existing = tags.find((tag) => tag.id === baseId);
    if (existing) {
      setDraftTagIds((prev) => (prev.includes(existing.id) ? prev : [...prev, existing.id]));
      resetTagEditor();
      return;
    }

    const existingIds = new Set(tags.map((tag) => tag.id));
    let nextId = baseId;
    let suffix = 2;
    while (existingIds.has(nextId)) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const nextTag: TagModel = {
      id: nextId,
      label,
      color: normalizeHexColor(newTagColor),
      description
    };
    setTags((prev) => [...prev, nextTag]);
    setDraftTagIds((prev) => (prev.includes(nextId) ? prev : [...prev, nextId]));
    resetTagEditor();
  }

  function clearTooltipTimer() {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }

  function resolveTooltipPoint(event: React.MouseEvent<SVGGElement>) {
    const frameRect = wheelFrameRef.current?.getBoundingClientRect();
    if (!frameRect) {
      return { x: event.clientX, y: event.clientY };
    }
    return {
      x: event.clientX - frameRect.left,
      y: event.clientY - frameRect.top
    };
  }

  function onActivityHoverStart(shape: ActivityShape, event: React.MouseEvent<SVGGElement>) {
    clearTooltipTimer();
    setActivityTooltip(null);
    tooltipPointRef.current = resolveTooltipPoint(event);
    tooltipTimerRef.current = window.setTimeout(() => {
      const point = tooltipPointRef.current;
      setActivityTooltip({
        activityId: shape.id,
        x: point.x,
        y: point.y
      });
      tooltipTimerRef.current = null;
    }, 1500);
  }

  function onActivityHoverMove(event: React.MouseEvent<SVGGElement>) {
    const point = resolveTooltipPoint(event);
    tooltipPointRef.current = point;
    setActivityTooltip((prev) => (prev ? { ...prev, x: point.x, y: point.y } : prev));
  }

  function onActivityHoverEnd() {
    clearTooltipTimer();
    setActivityTooltip(null);
  }

  function closeCategoryModal() {
    setIsCategoryModalOpen(false);
    setEditingRingId(null);
  }

  function openCategoryModal() {
    setEditingRingId(null);
    setNewCategoryName("");
    const paletteEntry = theme.ringPalette[ringTemplates.length % theme.ringPalette.length];
    setNewCategoryColor(paletteEntry?.accent ?? "#6da8c7");
    setIsCategoryModalOpen(true);
  }

  function openEditRingModal(ringId: string) {
    const selectedRing = themedRings.find((ring) => ring.id === ringId);
    if (!selectedRing) {
      return;
    }
    setEditingRingId(ringId);
    setNewCategoryName(selectedRing.label);
    setNewCategoryColor(selectedRing.accent);
    setIsCategoryModalOpen(true);
  }

  function saveCategoryRing() {
    const label = newCategoryName.trim().replace(/\s+/g, " ");
    if (!label) {
      return;
    }

    const accent = normalizeHexColor(newCategoryColor);
    const color = blendHexWithWhite(accent, 0.62);

    if (editingRingId) {
      setRingTemplates((prev) =>
        prev.map((ring) =>
          ring.id === editingRingId
            ? {
                ...ring,
                labels: {
                  nb: label,
                  en: label
                },
                color,
                accent
              }
            : ring
        )
      );
      setNewCategoryName("");
      setNewCategoryColor("#6da8c7");
      closeCategoryModal();
      return;
    }

    const existingIds = new Set(ringTemplates.map((ring) => ring.id));
    const baseId = slugifyCategoryId(label) || "ring";
    let nextId = baseId;
    let suffix = 2;
    while (existingIds.has(nextId)) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }

    setRingTemplates((prev) => [
      ...prev,
      {
        id: nextId,
        labels: { nb: label, en: label },
        heightPct: 24,
        color,
        accent
      }
    ]);
    setActiveCategoryIds((prev) => [...prev, nextId]);
    setNewCategoryName("");
    setNewCategoryColor("#6da8c7");
    closeCategoryModal();
  }

  async function deleteRing(ringId: string) {
    if (ringTemplates.length <= 1) {
      setSaveError(text.minimumOneRing);
      return;
    }

    const confirmed = window.confirm(text.deleteRingConfirm);
    if (!confirmed) {
      return;
    }

    const affectedActivities = activities.filter((activity) => activity.ringId === ringId);

    try {
      setSaveError("");
      setIsWheelBusy(true);
      if (affectedActivities.length > 0) {
        await Promise.all(
          affectedActivities.map((activity) =>
            requestJson<{ removed: number }>(`/api/activities/${activity.id}`, {
              method: "DELETE"
            })
          )
        );
      }

      setActivities((prev) => prev.filter((activity) => activity.ringId !== ringId));
      setRingTemplates((prev) => prev.filter((ring) => ring.id !== ringId));
      setActiveCategoryIds((prev) => prev.filter((id) => id !== ringId));

      if (selectedSlot?.ringId === ringId) {
        setSelectedSlot(null);
      }
      if (selectedActivityId && affectedActivities.some((activity) => activity.id === selectedActivityId)) {
        setSelectedActivityId(null);
      }
    } catch {
      setSaveError(text.wheelSaveFailed);
    } finally {
      setIsWheelBusy(false);
    }
  }

  function openCreateActivityModal() {
    const defaultRingId = selectedSlot?.ringId ?? visibleRings[0]?.id;
    if (!defaultRingId) {
      return;
    }

    const start = selectedSlot
      ? parseIso(selectedSlot.startAt)
      : DateTime.fromJSDate(scale.startAt, { zone: TIMEZONE }).startOf("day");
    const end = selectedSlot ? parseIso(selectedSlot.endAt) : start.plus({ weeks: 1 });
    const ring = themedRings.find((entry) => entry.id === defaultRingId);

    setSelectedActivityId(null);
    setSelectedSlot({
      ringId: defaultRingId,
      startAt: toIso(start) ?? `${startDate}T00:00:00`,
      endAt: toIso(end) ?? `${startDate}T00:00:00`
    });
    setDraftTitle(text.newActivityTitle);
    setDraftTagIds([]);
    setIsTagDialogOpen(false);
    setIsScheduleDialogOpen(false);
    setDraftSchedule(createDefaultSchedule(toIso(end) ?? `${startDate}T00:00:00`));
    setDraftReminderEmailsInput("");
    setDraftColor(ring?.accent ?? visibleRings[0]?.accent ?? THEME_PRESETS.nordic.ringPalette[0]?.accent ?? "#6da8c7");
    setIsActivityModalOpen(true);
  }

  function zoomIn() {
    setZoom((current) => clampZoom(current + ZOOM_STEP));
  }

  function zoomOut() {
    setZoom((current) => clampZoom(current - ZOOM_STEP));
  }

  function buildSchedulePayload(schedule: ActivityScheduleDraft) {
    return {
      cadence: schedule.cadence,
      timezone: schedule.timezone || TIMEZONE,
      deadlineAt: schedule.deadlineAt ? toIsoFromLocalDateTime(schedule.deadlineAt, schedule.timezone || TIMEZONE) : null,
      reminderOffsetsMinutes: [...new Set(schedule.reminderOffsetsMinutes.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry >= 0))],
      reminderEmails: [...new Set(schedule.reminderEmails.map((entry) => entry.trim()).filter(Boolean))],
      isEnabled: schedule.isEnabled
    };
  }

  async function persistActivitySchedule(activityId: string, schedule: ActivityScheduleDraft, fallbackEndAt: string) {
    const payload = await requestJson<{ schedule: ApiSchedule }>(`/api/activities/${activityId}/schedule`, {
      method: "PATCH",
      body: JSON.stringify(buildSchedulePayload(schedule))
    });
    return normalizeActivityScheduleFromApi(payload.schedule, fallbackEndAt);
  }

  async function copyVisibleWheel() {
    const svgElement = wheelSvgRef.current;
    if (!svgElement) {
      setCopyNotice(text.copyFailed);
      return;
    }

    async function copyTextWithFallback(text: string): Promise<boolean> {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          // Continue to legacy fallback
        }
      }

      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(textarea);
        return success;
      } catch {
        return false;
      }
    }

    function downloadFromUrl(url: string, filename: string): boolean {
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.rel = "noopener";
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      } catch {
        return false;
      }
    }

    try {
      const serializer = new XMLSerializer();
      let svgMarkup = serializer.serializeToString(svgElement);
      if (!svgMarkup.includes("xmlns=\"http://www.w3.org/2000/svg\"")) {
        svgMarkup = svgMarkup.replace(
          "<svg",
          "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\""
        );
      }

      const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
      const objectUrl = URL.createObjectURL(svgBlob);
      let pngBlob: Blob | null = null;
      let pngDataUrl = "";

      try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Image load failed"));
          img.src = objectUrl;
        });

        const viewBox = svgElement.viewBox.baseVal;
        const width = Math.max(1, Math.round(viewBox.width || VIEWBOX_SIZE));
        const height = Math.max(1, Math.round(viewBox.height || VIEWBOX_SIZE));
        const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);

        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas context unavailable");
        }

        context.scale(pixelRatio, pixelRatio);
        context.drawImage(image, 0, 0, width, height);

        pngBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((blob) => resolve(blob), "image/png")
        );
        if (pngBlob) {
          pngDataUrl = canvas.toDataURL("image/png");
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
      }

      const ClipboardItemCtor = (window as { ClipboardItem?: any }).ClipboardItem;

      if (pngBlob && navigator.clipboard?.write && ClipboardItemCtor) {
        try {
          await navigator.clipboard.write([new ClipboardItemCtor({ "image/png": pngBlob })]);
          setCopyNotice(text.copied);
          return;
        } catch {
          // Continue to next fallback
        }
      }

      if (navigator.clipboard?.write && ClipboardItemCtor) {
        try {
          await navigator.clipboard.write([new ClipboardItemCtor({ "image/svg+xml": svgBlob })]);
          setCopyNotice(text.copied);
          return;
        } catch {
          // Continue to next fallback
        }
      }

      if (pngDataUrl && (await copyTextWithFallback(pngDataUrl))) {
        setCopyNotice(text.copiedDataUrl);
        return;
      }

      if (await copyTextWithFallback(svgMarkup)) {
        setCopyNotice(text.copiedSvg);
        return;
      }

      if (pngDataUrl && downloadFromUrl(pngDataUrl, "aarshjul-wheel.png")) {
        setCopyNotice(text.clipboardBlockedPng);
        return;
      }

      const svgUrl = URL.createObjectURL(svgBlob);
      try {
        if (downloadFromUrl(svgUrl, "aarshjul-wheel.svg")) {
          setCopyNotice(text.clipboardBlockedSvg);
          return;
        }
      } finally {
        URL.revokeObjectURL(svgUrl);
      }

      setCopyNotice(text.clipboardBlocked);
    } catch {
      setCopyNotice(text.copyFailed);
    }
  }

  function onWheelClick(event: React.MouseEvent<SVGSVGElement>) {
    if (!activeWheelId || isHydratingWheel) {
      return;
    }
    clearTooltipTimer();
    setActivityTooltip(null);
    const rect = event.currentTarget.getBoundingClientRect();
    const viewBox = event.currentTarget.viewBox.baseVal;
    const point = {
      x: viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width,
      y: viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height
    };

    const centerPoint = { x: CENTER, y: CENTER };
    const clickedActivity = [...filteredActivityShapes]
      .reverse()
      .find((shape) =>
        hitTestArcSegment({
          point,
          center: centerPoint,
          innerRadius: shape.innerRadius,
          outerRadius: shape.outerRadius,
          startAngle: shape.startAngle,
          endAngle: shape.endAngle
        })
      );

    if (clickedActivity) {
      setSelectedActivityId(clickedActivity.id);
      setSelectedSlot({
        ringId: clickedActivity.ringId,
        startAt: clickedActivity.startAt,
        endAt: clickedActivity.endAt
      });
      setDraftTitle(clickedActivity.title);
      setDraftTagIds(clickedActivity.tags);
      setIsTagDialogOpen(false);
      setIsScheduleDialogOpen(false);
      setDraftColor(clickedActivity.color);
      const nextSchedule = clickedActivity.schedule ?? createDefaultSchedule(clickedActivity.endAt);
      setDraftSchedule(nextSchedule);
      setDraftReminderEmailsInput(nextSchedule.reminderEmails.join(", "));
      setIsActivityModalOpen(true);
      return;
    }

    const hitRing = hitTestRing(point, centerPoint, ringHitGeometries);
    if (!hitRing) {
      setSelectedSlot(null);
      setSelectedActivityId(null);
      setIsActivityModalOpen(false);
      return;
    }

    const polarPoint = cartesianToPolar(point, centerPoint);
    const clickedTime = DateTime.fromJSDate(scale.angleToTime(polarPoint.angle), { zone: TIMEZONE });
    const snappedSlot = snapToVisibleWeek(clickedTime, scale);
    const ring = themedRings.find((entry) => entry.id === hitRing.id);

    setSelectedSlot({
      ringId: hitRing.id,
      startAt: toIso(snappedSlot.start) ?? `${startDate}T00:00:00`,
      endAt: toIso(snappedSlot.end) ?? `${startDate}T00:00:00`
    });
    setSelectedActivityId(null);
    setDraftTitle(text.newActivityTitle);
    setDraftTagIds([]);
    setIsTagDialogOpen(false);
    setIsScheduleDialogOpen(false);
    setDraftSchedule(createDefaultSchedule(toIso(snappedSlot.end) ?? `${startDate}T00:00:00`));
    setDraftReminderEmailsInput("");
    setDraftColor(ring?.accent ?? visibleRings[0]?.accent ?? THEME_PRESETS.nordic.ringPalette[0]?.accent ?? "#6da8c7");
    setIsActivityModalOpen(true);
  }

  function onSlotDateChange(field: "startAt" | "endAt", value: string) {
    if (!selectedSlot) {
      return;
    }

    const nextDate = DateTime.fromISO(value, { zone: TIMEZONE }).startOf("day");
    if (!nextDate.isValid) {
      return;
    }

    const updated = {
      ...selectedSlot,
      [field]: toIso(nextDate) ?? selectedSlot[field]
    };

    const start = parseIso(updated.startAt);
    const end = parseIso(updated.endAt);
    if (end <= start) {
      updated.endAt = toIso(start.plus({ days: 1 })) ?? updated.endAt;
    }

    setSelectedSlot(updated);
  }

  async function saveActivity() {
    if (!selectedSlot) {
      return;
    }
    if (!activeWheelId) {
      return;
    }

    const title = draftTitle.trim() || text.newActivityTitle;
    const color = draftColor;
    const tags = [...new Set(draftTagIds)];
    const schedule: ActivityScheduleDraft = {
      ...draftSchedule,
      reminderEmails: [...new Set(draftSchedule.reminderEmails.map((entry) => entry.trim()).filter(Boolean))]
    };

    try {
      setSaveError("");
      if (selectedActivityId) {
        const updatedPayload = await requestJson<{ activity: ApiActivity }>(`/api/activities/${selectedActivityId}`, {
          method: "PATCH",
          body: JSON.stringify({
            ringId: selectedSlot.ringId,
            title,
            color,
            tags,
            startAt: selectedSlot.startAt,
            endAt: selectedSlot.endAt
          })
        });
        const normalized = normalizeActivityFromApi(updatedPayload.activity);
        normalized.schedule = await persistActivitySchedule(normalized.id, schedule, normalized.endAt);
        setActivities((prev) => prev.map((activity) => (activity.id === selectedActivityId ? normalized : activity)));
        onTagHoverEnd();
        setIsTagDialogOpen(false);
        setIsScheduleDialogOpen(false);
        setIsActivityModalOpen(false);
        return;
      }

      const createdPayload = await requestJson<{ activity: ApiActivity }>(`/api/wheels/${activeWheelId}/activities`, {
        method: "POST",
        body: JSON.stringify({
          ringId: selectedSlot.ringId,
          title,
          color,
          tags,
          startAt: selectedSlot.startAt,
          endAt: selectedSlot.endAt
        })
      });
      const newActivity = normalizeActivityFromApi(createdPayload.activity);
      newActivity.schedule = await persistActivitySchedule(newActivity.id, schedule, newActivity.endAt);
      setActivities((prev) => [...prev, newActivity]);
      setSelectedActivityId(newActivity.id);
      onTagHoverEnd();
      setIsTagDialogOpen(false);
      setIsScheduleDialogOpen(false);
      setIsActivityModalOpen(false);
    } catch {
      setSaveError(text.wheelSaveFailed);
    }
  }

  async function deleteActivity() {
    if (!selectedActivityId) {
      return;
    }
    try {
      setSaveError("");
      await requestJson<{ removed: number }>(`/api/activities/${selectedActivityId}`, {
        method: "DELETE"
      });
      setActivities((prev) => prev.filter((activity) => activity.id !== selectedActivityId));
      setSelectedActivityId(null);
      setSelectedSlot(null);
      onTagHoverEnd();
      setIsTagDialogOpen(false);
      setIsScheduleDialogOpen(false);
      setIsActivityModalOpen(false);
    } catch {
      setSaveError(text.wheelSaveFailed);
    }
  }

  const selectedRingBand = selectedSlot
    ? ringBands.find((entry) => entry.ring.id === selectedSlot.ringId)
    : null;
  const selectedStartAngle = selectedSlot ? scale.timeToAngle(selectedSlot.startAt) : 0;
  const selectedEndAngle = selectedSlot
    ? Math.max(selectedStartAngle + 0.01, scale.timeToAngle(selectedSlot.endAt))
    : 0;
  const zoomPct = Math.round(zoom * 100);
  const viewZoom = Math.min(zoom, 1);
  const svgScale = Math.max(zoom, 1);
  const viewBoxSize = VIEWBOX_SIZE / viewZoom;
  const zoomAnchor = CENTER - ZOOM_ANCHOR_RADIUS;
  const viewBoxMin = zoomAnchor - zoomAnchor / zoom;
  const seamInnerPoint = polar(CENTER, CENTER, ACTIVITY_INNER_RADIUS - 8, SEAM_ANGLE);
  const seamOuterPoint = polar(CENTER, CENTER, MONTH_RING_OUTER + 1, SEAM_ANGLE);

  useEffect(() => {
    if (status === "loading") {
      return;
    }
    if (status !== "authenticated") {
      setWheels([]);
      setActiveWheelId(null);
      setShares([]);
      setUserTenants([]);
      setTenantChooserId("");
      setIsTenantChooserOpen(false);
      setTenantScopeError("");
      tenantBootstrapRef.current = false;
      loadedWheelIdRef.current = null;
      return;
    }
    if (isSwitchingTenant) {
      return;
    }

    let disposed = false;
    (async () => {
      try {
        setLoadError("");
        await loadUserTenants();
        if (disposed) {
          return;
        }
        if (isTenantChooserOpen || !activeTenantId) {
          return;
        }
        await loadWheelsList();
      } catch {
        if (!disposed) {
          setLoadError(text.wheelLoadFailed);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [status, activeTenantId, isTenantChooserOpen, isSwitchingTenant]);

  useEffect(() => {
    if (status !== "authenticated" || isSwitchingTenant || !activeTenantId) {
      setShareableUsers([]);
      setShareUserSelectionEmail("");
      setShareUserEmail("");
      return;
    }

    let disposed = false;
    (async () => {
      await loadShareableUsers();
      if (disposed) {
        return;
      }
    })();

    return () => {
      disposed = true;
    };
  }, [status, activeTenantId, isSwitchingTenant]);

  useEffect(() => {
    if (status === "loading" || status === "authenticated") {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const providers = await getProviders();
        if (cancelled) {
          return;
        }
        setHasAzureAuth(Boolean(providers?.["azure-ad"]));
      } catch {
        if (!cancelled) {
          setHasAzureAuth(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (status === "loading" || status === "authenticated") {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const payload = await requestJson<{ tenants: PublicTenantLoginOptionModel[] }>("/api/public/tenants");
        if (cancelled) {
          return;
        }

        const options = Array.isArray(payload.tenants) ? payload.tenants : [];
        setLoginTenants(options);
        const storedTenantId = window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)?.trim() || "";
        const preferred = options.find((tenant) => tenant.id === storedTenantId) ?? options[0] ?? null;
        setLoginTenantId(preferred?.id ?? "");
      } catch {
        if (!cancelled) {
          setLoginTenants([]);
          setLoginTenantId("");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || !activeWheelId) {
      return;
    }

    let disposed = false;
    (async () => {
      await loadWheelData(activeWheelId);
      if (disposed) {
        return;
      }
    })();

    return () => {
      disposed = true;
    };
  }, [status, activeWheelId]);

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !activeWheelId ||
      isHydratingRef.current ||
      loadedWheelIdRef.current !== activeWheelId
    ) {
      return;
    }

    if (configSaveTimerRef.current !== null) {
      window.clearTimeout(configSaveTimerRef.current);
      configSaveTimerRef.current = null;
    }

    configSaveTimerRef.current = window.setTimeout(async () => {
      try {
        setSaveError("");
        const payload = await requestJson<{ wheel: WheelSummary }>(`/api/wheels/${activeWheelId}`, {
          method: "PATCH",
          body: JSON.stringify({
            config: {
              ringTemplates,
              tags,
              themeId,
              language,
              seamShadowEnabled,
              windowAnchorMode
            } satisfies WheelConfigModel
          })
        });
        setWheels((prev) => prev.map((wheel) => (wheel.id === payload.wheel.id ? { ...wheel, ...payload.wheel } : wheel)));
      } catch {
        setSaveError(text.wheelSaveFailed);
      } finally {
        configSaveTimerRef.current = null;
      }
    }, 420);

    return () => {
      if (configSaveTimerRef.current !== null) {
        window.clearTimeout(configSaveTimerRef.current);
        configSaveTimerRef.current = null;
      }
    };
  }, [status, activeWheelId, ringTemplates, tags, themeId, language, seamShadowEnabled, windowAnchorMode]);

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !activeWheelId ||
      isHydratingRef.current ||
      loadedWheelIdRef.current !== activeWheelId
    ) {
      return;
    }

    if (durationSaveTimerRef.current !== null) {
      window.clearTimeout(durationSaveTimerRef.current);
      durationSaveTimerRef.current = null;
    }

    durationSaveTimerRef.current = window.setTimeout(async () => {
      try {
        setSaveError("");
        const payload = await requestJson<{ wheel: WheelSummary }>(`/api/wheels/${activeWheelId}`, {
          method: "PATCH",
          body: JSON.stringify({ durationMonths })
        });
        setWheels((prev) => prev.map((wheel) => (wheel.id === payload.wheel.id ? { ...wheel, ...payload.wheel } : wheel)));
      } catch {
        setSaveError(text.wheelSaveFailed);
      } finally {
        durationSaveTimerRef.current = null;
      }
    }, 260);

    return () => {
      if (durationSaveTimerRef.current !== null) {
        window.clearTimeout(durationSaveTimerRef.current);
        durationSaveTimerRef.current = null;
      }
    };
  }, [status, activeWheelId, durationMonths]);

  useEffect(() => {
    const validIds = new Set(themedRings.map((ring) => ring.id));
    setActiveCategoryIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      if (next.length === prev.length) {
        return prev;
      }
      return next;
    });
  }, [themedRings]);

  useEffect(() => {
    setTags((prev) => {
      const knownIds = new Set(prev.map((tag) => tag.id));
      const additions: TagModel[] = [];
      for (const activity of activities) {
        for (const tagId of activity.tags) {
          if (knownIds.has(tagId)) {
            continue;
          }
          knownIds.add(tagId);
          additions.push({
            id: tagId,
            label: tagId,
            color: "#8ea1b8",
            description: "Auto-opprettet fra aktivitet."
          });
        }
      }
      if (additions.length === 0) {
        return prev;
      }
      return [...prev, ...additions];
    });
  }, [activities]);

  useEffect(() => {
    const validTagKeys = new Set(tagSummary.map((tag) => tag.key));
    setActiveTagKeys((prev) => {
      const next = prev.filter((key) => validTagKeys.has(key));
      if (next.length === prev.length) {
        return prev;
      }
      return next;
    });
  }, [tagSummary]);

  useEffect(() => {
    if (selectedSlot && !activeCategorySet.has(selectedSlot.ringId)) {
      setSelectedSlot(null);
      setSelectedActivityId(null);
      setIsActivityModalOpen(false);
    }
  }, [activeCategorySet, selectedSlot]);

  useEffect(() => {
    if (!selectedActivityId) {
      return;
    }
    const isStillVisible = filteredActivityShapes.some((shape) => shape.id === selectedActivityId);
    if (isStillVisible) {
      return;
    }
    setSelectedActivityId(null);
    setSelectedSlot(null);
    setIsActivityModalOpen(false);
  }, [filteredActivityShapes, selectedActivityId]);

  useEffect(() => {
    if (!activityTooltip) {
      return;
    }
    const isStillVisible = filteredActivityShapes.some((shape) => shape.id === activityTooltip.activityId);
    if (!isStillVisible) {
      setActivityTooltip(null);
    }
  }, [activityTooltip, filteredActivityShapes]);

  useEffect(() => {
    if (selectedActivityId) {
      return;
    }
    const activeRingId = selectedSlot?.ringId ?? visibleRings[0]?.id;
    if (!activeRingId) {
      return;
    }
    const ring = visibleRings.find((entry) => entry.id === activeRingId);
    if (ring) {
      setDraftColor(ring.accent);
    }
  }, [selectedActivityId, selectedSlot?.ringId, visibleRings]);

  useEffect(() => {
    const today = DateTime.now().setZone(TIMEZONE);
    const nextStart =
      windowAnchorMode === "dynamic_today"
        ? alignedWindowStart(today, durationMonths).toISODate()
        : weekWindowStart(today).toISODate();
    if (!nextStart) {
      return;
    }
    setStartDate((prev) => {
      if (prev === nextStart) {
        return prev;
      }
      setSelectedSlot(null);
      setSelectedActivityId(null);
      return nextStart;
    });
  }, [windowAnchorMode, durationMonths]);

  useEffect(() => {
    if (!copyNotice) {
      return;
    }
    const timer = window.setTimeout(() => setCopyNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [copyNotice]);

  useEffect(() => {
    if (!azureCopyNotice) {
      return;
    }
    const timer = window.setTimeout(() => setAzureCopyNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [azureCopyNotice]);

  useEffect(
    () => () => {
      clearTooltipTimer();
      clearTagTooltipTimer();
      if (configSaveTimerRef.current !== null) {
        window.clearTimeout(configSaveTimerRef.current);
        configSaveTimerRef.current = null;
      }
      if (durationSaveTimerRef.current !== null) {
        window.clearTimeout(durationSaveTimerRef.current);
        durationSaveTimerRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (isActivityModalOpen) {
      return;
    }
    setIsTagDialogOpen(false);
    setIsScheduleDialogOpen(false);
  }, [isActivityModalOpen]);

  useEffect(() => {
    if (!isSharingOpen) {
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (sharingPopoverRef.current?.contains(target)) {
        return;
      }
      if (sharingTriggerRef.current?.contains(target)) {
        return;
      }
      setIsSharingOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSharingOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSharingOpen]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (settingsPopoverRef.current?.contains(target)) {
        return;
      }
      if (settingsTriggerRef.current?.contains(target)) {
        return;
      }
      if (isAdminSetupOpen && adminSetupModalRef.current?.contains(target)) {
        return;
      }
      if (isUserAdminDialogOpen && userAdminDialogRef.current?.contains(target)) {
        return;
      }
      if (isAzureSetupDialogOpen && azureSetupDialogRef.current?.contains(target)) {
        return;
      }
      setIsSettingsOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isAzureSetupDialogOpen) {
          return;
        }
        if (isUserAdminDialogOpen) {
          closeAdminUserEditor();
          setIsUserAdminDialogOpen(false);
          return;
        }
        if (isAdminSetupOpen) {
          setIsAdminSetupOpen(false);
          return;
        }
        setIsSettingsOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isAdminSetupOpen, isAzureSetupDialogOpen, isSettingsOpen, isUserAdminDialogOpen]);

  useEffect(() => {
    if (!isAdminSetupOpen) {
      setIsAzureSetupDialogOpen(false);
      closeAdminUserEditor();
      setIsUserAdminDialogOpen(false);
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (adminSetupModalRef.current?.contains(target)) {
        return;
      }
      if (isUserAdminDialogOpen && userAdminDialogRef.current?.contains(target)) {
        return;
      }
      if (isAzureSetupDialogOpen && azureSetupDialogRef.current?.contains(target)) {
        return;
      }
      setIsAdminSetupOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isAzureSetupDialogOpen) {
          return;
        }
        if (isUserAdminDialogOpen) {
          closeAdminUserEditor();
          setIsUserAdminDialogOpen(false);
          return;
        }
        setIsAdminSetupOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isAdminSetupOpen, isAzureSetupDialogOpen, isUserAdminDialogOpen]);

  useEffect(() => {
    if (!isUserAdminDialogOpen) {
      closeAdminUserEditor();
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (userAdminDialogRef.current?.contains(target)) {
        return;
      }
      closeAdminUserEditor();
      setIsUserAdminDialogOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeAdminUserEditor();
        setIsUserAdminDialogOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isUserAdminDialogOpen]);

  useEffect(() => {
    const hasModalOpen =
      isSettingsOpen ||
      isSharingOpen ||
      isTenantChooserOpen ||
      isAdminSetupOpen ||
      isAzureSetupDialogOpen ||
      isUserAdminDialogOpen ||
      isActivityModalOpen ||
      isCategoryModalOpen ||
      isWheelRenameDialogOpen ||
      isTagDialogOpen ||
      isScheduleDialogOpen;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    if (hasModalOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [
    isSettingsOpen,
    isSharingOpen,
    isTenantChooserOpen,
    isAdminSetupOpen,
    isAzureSetupDialogOpen,
    isUserAdminDialogOpen,
    isActivityModalOpen,
    isCategoryModalOpen,
    isWheelRenameDialogOpen,
    isTagDialogOpen,
    isScheduleDialogOpen
  ]);

  useEffect(() => {
    if (!isAzureSetupDialogOpen) {
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (azureSetupDialogRef.current?.contains(target)) {
        return;
      }
      setIsAzureSetupDialogOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAzureSetupDialogOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isAzureSetupDialogOpen]);

  useEffect(() => {
    if (!isActivityModalOpen) {
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (activityModalRef.current?.contains(target)) {
        return;
      }
      onTagHoverEnd();
      setIsTagDialogOpen(false);
      setIsScheduleDialogOpen(false);
      setIsActivityModalOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isScheduleDialogOpen) {
          setIsScheduleDialogOpen(false);
          return;
        }
        if (isTagDialogOpen) {
          setIsTagDialogOpen(false);
          return;
        }
        onTagHoverEnd();
        setIsActivityModalOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isActivityModalOpen, isScheduleDialogOpen, isTagDialogOpen]);

  useEffect(() => {
    if (!isTagDialogOpen) {
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (activityTagDialogRef.current?.contains(target)) {
        return;
      }
      if (activityModalRef.current?.contains(target)) {
        setIsTagDialogOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsTagDialogOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isTagDialogOpen]);

  useEffect(() => {
    if (!isScheduleDialogOpen) {
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (activityScheduleDialogRef.current?.contains(target)) {
        return;
      }
      if (activityModalRef.current?.contains(target)) {
        setIsScheduleDialogOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsScheduleDialogOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isScheduleDialogOpen]);

  useEffect(() => {
    if (!isCategoryModalOpen) {
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (categoryModalRef.current?.contains(target)) {
        return;
      }
      setIsCategoryModalOpen(false);
      setEditingRingId(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsCategoryModalOpen(false);
        setEditingRingId(null);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isCategoryModalOpen]);

  useEffect(() => {
    if (!isWheelRenameDialogOpen) {
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (wheelRenameDialogRef.current?.contains(target)) {
        return;
      }
      closeWheelRenameDialog();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeWheelRenameDialog();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isWheelRenameDialogOpen]);

  if (status === "loading") {
    return (
      <main className="wheel-page-auth">
        <section className="auth-card">
          <p>{text.loading}</p>
        </section>
      </main>
    );
  }

  if (status !== "authenticated") {
    return (
      <main className="wheel-page-auth">
        <section className="auth-card auth-card-modern">
          <header className="auth-brand-row">
            <span className="auth-brand-mark" aria-hidden>
              <svg viewBox="0 0 64 64" role="presentation" focusable="false">
                <circle cx="32" cy="32" r="28" fill="#0a1135" />
                <circle cx="32" cy="12" r="4" fill="#ffffff" />
                <circle cx="50" cy="20" r="4" fill="#ffffff" />
                <circle cx="54" cy="36" r="4" fill="#ffffff" />
                <circle cx="42" cy="50" r="4" fill="#ffffff" />
                <circle cx="22" cy="52" r="4" fill="#ffffff" />
                <circle cx="10" cy="40" r="4" fill="#ffffff" />
                <circle cx="10" cy="24" r="4" fill="#ffffff" />
                <circle cx="20" cy="14" r="4" fill="#ffffff" />
                <circle cx="32" cy="32" r="7" fill="#ffffff" />
              </svg>
            </span>
            <h1>AARSHJUL</h1>
          </header>
          <p className="auth-subtitle">{text.authRequired}</p>
          <label className="auth-tenant-picker">
            <span>{text.loginTenantLabel}</span>
            <select
              value={loginTenantId}
              onChange={(event) => {
                setLoginTenantId(event.target.value);
                setLocalAuthError("");
              }}
              disabled={loginTenants.length === 0}
            >
              {loginTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
          {loginTenants.length === 0 ? <p className="auth-provider-note">{text.loginTenantUnavailable}</p> : null}

          {localProviderEnabled ? (
            <>
              <form className="auth-form auth-form-modern" onSubmit={onSubmitLocalAuth}>
                {localAuthMode === "register" ? (
                  <label>
                    <span>{text.localName}</span>
                    <input
                      value={localName}
                      onChange={(event) => setLocalName(event.target.value)}
                      autoComplete="name"
                      placeholder={text.localName}
                    />
                  </label>
                ) : null}

                <label>
                  <span>{text.localEmail}</span>
                  <input
                    type="email"
                    value={localEmail}
                    onChange={(event) => setLocalEmail(event.target.value)}
                    autoComplete="email"
                    placeholder={text.localEmail}
                    required
                  />
                </label>

                <label>
                  <span>{text.localPassword}</span>
                  <input
                    type="password"
                    value={localPassword}
                    onChange={(event) => setLocalPassword(event.target.value)}
                    autoComplete={localAuthMode === "login" ? "current-password" : "new-password"}
                    placeholder={text.localPassword}
                    required
                  />
                </label>

                {localAuthMode === "login" ? (
                  <a className="auth-forgot-link" href="#" onClick={(event) => event.preventDefault()}>
                    {text.forgotPassword}
                  </a>
                ) : null}

                {localAuthError ? <p className="auth-error">{localAuthError}</p> : null}

                <button type="submit" className="auth-primary-button" disabled={localAuthBusy}>
                  {localAuthMode === "login" ? text.localSignIn : text.localRegister}
                </button>
              </form>

              <button
                type="button"
                className="auth-mode-toggle auth-mode-toggle-modern"
                onClick={() => {
                  setLocalAuthError("");
                  setLocalAuthMode((prev) => (prev === "login" ? "register" : "login"));
                }}
              >
                {localAuthMode === "login" ? text.localNeedAccount : text.localHaveAccount}
              </button>
            </>
          ) : null}

          {azureProviderEnabled ? (
            <>
              {localProviderEnabled ? <p className="auth-or-divider">{text.authOr}</p> : null}
              <button
                type="button"
                className="auth-azure-button auth-azure-button-modern"
                onClick={onAzureSignIn}
              >
                <span aria-hidden className="microsoft-logo-mark">
                  <svg viewBox="0 0 16 16" role="presentation" focusable="false">
                    <rect x="1" y="1" width="6" height="6" fill="#f25022" />
                    <rect x="9" y="1" width="6" height="6" fill="#7fba00" />
                    <rect x="1" y="9" width="6" height="6" fill="#00a4ef" />
                    <rect x="9" y="9" width="6" height="6" fill="#ffb900" />
                  </svg>
                </span>
                <span>{text.azureSignIn}</span>
              </button>
            </>
          ) : null}

          {!localProviderEnabled && !azureProviderEnabled && loginTenants.length > 0 ? (
            <p className="auth-provider-note">{text.noAuthProviders}</p>
          ) : null}

          <Link href="/sysadmin-login" className="auth-sysadmin-icon-link" aria-label={text.sysAdminOpenPage} title={text.sysAdminOpenPage}>
            <svg viewBox="0 0 24 24" role="presentation" focusable="false" aria-hidden>
              <path
                d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Zm3 3a2 2 0 0 1 1 3.73V19h-2v-2.27A2 2 0 0 1 12 13Z"
                fill="currentColor"
              />
            </svg>
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="wheel-page">
      <section className="wheel-stage">
        <header className="wheel-toolbar">
          <div className="toolbar-controls">
            <div className="window-nav">
              <button type="button" onClick={() => shiftWindow(-1)}>
                {text.previous}
              </button>
              <p>
                {formatDateForLanguage(visibleStart, language)} - {formatDateForLanguage(visibleEnd, language)}
              </p>
              <button type="button" onClick={() => shiftWindow(1)}>
                {text.next}
              </button>
              <label className="window-jump">
                <span>{text.jumpTo}</span>
                <select value={startDate} onChange={(event) => jumpToWindow(event.target.value)}>
                  {jumpOptions.map((option) => (
                    <option key={`jump-option-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="period-switch">
              {[12, 6, 3].map((months) => (
                <button
                  key={months}
                  type="button"
                  className={durationMonths === months ? "is-active" : ""}
                  onClick={() => setDurationMonths(months as 3 | 6 | 12)}
                >
                  {months} {text.monthsSuffix}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="wheel-frame" ref={wheelFrameRef}>
          <div className="wheel-scroll-content" style={{ width: `${svgNum(svgScale * 100, 3)}%` }}>
            <svg
              ref={wheelSvgRef}
              className="wheel-svg"
              viewBox={`${svgNum(viewBoxMin)} ${svgNum(viewBoxMin)} ${svgNum(viewBoxSize)} ${svgNum(viewBoxSize)}`}
              onClick={onWheelClick}
            >
              <defs>
                <filter id="year-seam-shadow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3.2" />
                </filter>
              </defs>
              <rect
                x={svgNum(viewBoxMin)}
                y={svgNum(viewBoxMin)}
                width={svgNum(viewBoxSize)}
                height={svgNum(viewBoxSize)}
                fill={theme.wheel.canvasBg}
              />
              <g>

            {ringBands.map(({ ring, activityBand }) => (
              <path
                key={`ring-base-${ring.id}`}
                d={describeWedge(
                  CENTER,
                  CENTER,
                  activityBand.innerRadius,
                  activityBand.outerRadius,
                  0,
                  FULL_CIRCLE - 0.0001
                )}
                fill={ring.color}
                stroke={theme.wheel.ringStroke}
                strokeWidth={1}
              />
            ))}

            {ringBands.map(({ ring, categoryBand }) => {
              const midRadius = (categoryBand.innerRadius + categoryBand.outerRadius) / 2;
              const ringWidth = categoryBand.outerRadius - categoryBand.innerRadius;
              const baselineShift = Math.min(CATEGORY_LABEL_FONT_SIZE * CATEGORY_LABEL_BASELINE_BIAS, ringWidth / 2 - 1);
              const labelRadius = midRadius - baselineShift;
              const sectorSpan = FULL_CIRCLE / CATEGORY_LABEL_REPEAT_COUNT;
              const labelArcs = Array.from({ length: CATEGORY_LABEL_REPEAT_COUNT }, (_, index) => {
                const start = index * sectorSpan + sectorSpan * CATEGORY_LABEL_ARC_PADDING_FRACTION;
                const end = (index + 1) * sectorSpan - sectorSpan * CATEGORY_LABEL_ARC_PADDING_FRACTION;
                const pathId = `category-path-${ring.id}-${index}`;
                return {
                  pathId,
                  d: describeArcPath(CENTER, CENTER, labelRadius, start, end)
                };
              });
              return (
                <g key={`category-${ring.id}`}>
                  <path
                    d={describeWedge(
                      CENTER,
                      CENTER,
                      categoryBand.innerRadius,
                      categoryBand.outerRadius,
                      0,
                      FULL_CIRCLE - 0.0001
                    )}
                    fill={theme.wheel.categoryFill}
                    stroke={theme.wheel.categoryStroke}
                    strokeWidth={1.1}
                  />
                  {labelArcs.map((arc) => (
                    <g key={arc.pathId}>
                      <path id={arc.pathId} d={arc.d} fill="none" stroke="none" />
                      <text
                        fill={theme.wheel.categoryText}
                        fontSize={CATEGORY_LABEL_FONT_SIZE}
                        fontWeight={400}
                        letterSpacing="0.03"
                      >
                        <textPath href={`#${arc.pathId}`} startOffset="50%" textAnchor="middle">
                          {ring.label}
                        </textPath>
                      </text>
                    </g>
                  ))}
                </g>
              );
            })}

            <path
              d={describeWedge(CENTER, CENTER, WEEK_RING_INNER, WEEK_RING_OUTER, 0, FULL_CIRCLE - 0.0001)}
              fill={theme.wheel.weekRingFill}
              stroke={theme.wheel.weekRingStroke}
              strokeWidth={1}
            />
            <path
              d={describeWedge(CENTER, CENTER, MONTH_RING_INNER, MONTH_RING_OUTER, 0, FULL_CIRCLE - 0.0001)}
              fill={theme.wheel.monthRingFill}
              stroke={theme.wheel.monthRingStroke}
              strokeWidth={1}
            />

            {weekSegments.map((segment, index) => {
              const p1 = polar(CENTER, CENTER, WEEK_RING_INNER, segment.startAngle);
              const p2 = polar(CENTER, CENTER, WEEK_RING_OUTER, segment.startAngle);
              const mid = (segment.startAngle + segment.endAngle) / 2;
              const textDeg = readableTangentDeg(mid);
              const labelPoint = polar(CENTER, CENTER, (WEEK_RING_INNER + WEEK_RING_OUTER) / 2, mid);
              return (
                <g key={`week-${index}`}>
                  <line
                    x1={svgNum(p1.x)}
                    y1={svgNum(p1.y)}
                    x2={svgNum(p2.x)}
                    y2={svgNum(p2.y)}
                    stroke={theme.wheel.weekRingStroke}
                    strokeWidth={1}
                  />
                  <text
                    x={svgNum(labelPoint.x)}
                    y={svgNum(labelPoint.y)}
                    fill={theme.wheel.weekText}
                    fontSize="11"
                    fontWeight={470}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={svgRotate(textDeg, labelPoint.x, labelPoint.y)}
                  >
                    {segment.label}
                  </text>
                </g>
              );
            })}

            {monthSegments.map((segment, index) => {
              const p1 = polar(CENTER, CENTER, MONTH_RING_INNER, segment.startAngle);
              const p2 = polar(CENTER, CENTER, MONTH_RING_OUTER, segment.startAngle);
              const pathId = `month-path-${index}`;
              const path = describeArcPath(
                CENTER,
                CENTER,
                (MONTH_RING_INNER + MONTH_RING_OUTER) / 2,
                segment.startAngle + 0.015,
                segment.endAngle - 0.015
              );
              return (
                <g key={`month-${index}`}>
                  <line
                    x1={svgNum(p1.x)}
                    y1={svgNum(p1.y)}
                    x2={svgNum(p2.x)}
                    y2={svgNum(p2.y)}
                    stroke={theme.wheel.monthRingStroke}
                    strokeWidth={1.1}
                  />
                  <path id={pathId} d={path} fill="none" stroke="none" />
                  <text fill={theme.wheel.monthText} fontSize="15" fontWeight={500}>
                    <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
                      {segment.label}
                    </textPath>
                  </text>
                </g>
              );
            })}

            {ringBands.map(({ ring, activityBand }) =>
              weekSegments.map((segment, index) => {
                const p1 = polar(CENTER, CENTER, activityBand.innerRadius, segment.startAngle);
                const p2 = polar(CENTER, CENTER, activityBand.outerRadius, segment.startAngle);
                return (
                  <line
                    key={`grid-${ring.id}-${index}`}
                    x1={svgNum(p1.x)}
                    y1={svgNum(p1.y)}
                    x2={svgNum(p2.x)}
                    y2={svgNum(p2.y)}
                    stroke={theme.wheel.gridStroke}
                    strokeWidth={0.7}
                    opacity={0.75}
                  />
                );
              })
            )}

            {seamShadowEnabled ? (
              <>
                <path
                  d={describeWedge(
                    CENTER,
                    CENTER,
                    ACTIVITY_INNER_RADIUS - 8,
                    MONTH_RING_OUTER + 1,
                    FULL_CIRCLE - 0.006,
                    FULL_CIRCLE - 0.0001
                  )}
                  fill={theme.wheel.seamLight}
                />
                <path
                  d={describeWedge(
                    CENTER,
                    CENTER,
                    ACTIVITY_INNER_RADIUS - 8,
                    MONTH_RING_OUTER + 1,
                    SEAM_ANGLE,
                    SEAM_ANGLE + 0.007
                  )}
                  fill={theme.wheel.seamLight}
                />
                <path
                  d={describeWedge(
                    CENTER,
                    CENTER,
                    ACTIVITY_INNER_RADIUS - 8,
                    MONTH_RING_OUTER + 2,
                    SEAM_ANGLE + 0.007,
                    SEAM_ANGLE + 0.055
                  )}
                  fill={theme.wheel.seamShadow}
                  filter="url(#year-seam-shadow)"
                />
                <line
                  x1={svgNum(seamInnerPoint.x)}
                  y1={svgNum(seamInnerPoint.y)}
                  x2={svgNum(seamOuterPoint.x)}
                  y2={svgNum(seamOuterPoint.y)}
                  stroke={theme.wheel.seamLine}
                  strokeWidth={1.2}
                />
              </>
            ) : null}

            {filteredActivityShapes.map((shape) => {
              const span = shape.endAngle - shape.startAngle;
              const mid = (shape.startAngle + shape.endAngle) / 2;
              const textDeg = readableTangentDeg(mid);
              const labelRadius = (shape.innerRadius + shape.outerRadius) / 2;
              const labelPoint = polar(CENTER, CENTER, labelRadius, mid);
              const lines = splitTitle(shape.title, span > 0.3 ? 11 : 9);
              const lineHeight = 11;
              const yBase = labelPoint.y - ((lines.length - 1) * lineHeight) / 2;
              const markerPoint = polar(CENTER, CENTER, shape.innerRadius + 9, shape.startAngle + 0.04);
              const isSelected = selectedActivityId === shape.id;

              return (
                <g
                  key={shape.id}
                  onMouseEnter={(event) => onActivityHoverStart(shape, event)}
                  onMouseMove={onActivityHoverMove}
                  onMouseLeave={onActivityHoverEnd}
                >
                  <path
                    d={describeWedge(
                      CENTER,
                      CENTER,
                      shape.innerRadius,
                      shape.outerRadius,
                      shape.startAngle,
                      shape.endAngle
                    )}
                    fill={shape.color}
                    stroke={isSelected ? theme.wheel.selectedActivityStroke : theme.wheel.activityStroke}
                    strokeWidth={isSelected ? 2.3 : 1.2}
                  />
                  {shape.recurring ? (
                    <text
                      x={svgNum(markerPoint.x)}
                      y={svgNum(markerPoint.y)}
                      fill={theme.wheel.recurringMark}
                      fontSize="10"
                      fontWeight={700}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      *
                    </text>
                  ) : null}
                  {span > 0.095 ? (
                    <text
                      x={svgNum(labelPoint.x)}
                      y={svgNum(yBase)}
                      fill={theme.wheel.activityText}
                      fontSize="11"
                      fontWeight={520}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={svgRotate(textDeg, labelPoint.x, labelPoint.y)}
                    >
                      {lines.map((line, idx) => (
                        <tspan
                          key={`${shape.id}-${idx}`}
                          x={svgNum(labelPoint.x)}
                          y={svgNum(yBase + idx * lineHeight)}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {selectedSlot && selectedRingBand ? (
              <path
                d={describeWedge(
                  CENTER,
                  CENTER,
                  selectedRingBand.activityBand.innerRadius,
                  selectedRingBand.activityBand.outerRadius,
                  selectedStartAngle,
                  selectedEndAngle
                )}
                fill="none"
                stroke={theme.wheel.selectionStroke}
                strokeWidth={1.6}
                strokeDasharray="6 5"
              />
            ) : null}

              <circle
                cx={CENTER}
                cy={CENTER}
                r={ACTIVITY_INNER_RADIUS - 8}
                fill={theme.wheel.centerFill}
                stroke={theme.wheel.centerStroke}
              />
              </g>
            </svg>
          </div>
          <div className="wheel-frame-tools">
            <div className="zoom-controls">
              <button type="button" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>
                -
              </button>
              <span>{zoomPct}%</span>
              <button type="button" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>
                +
              </button>
            </div>
          </div>
          {activityTooltip && tooltipActivity ? (
            <div
              className="wheel-activity-tooltip"
              role="status"
              aria-live="polite"
              style={{
                left: `${svgNum(activityTooltip.x)}px`,
                top: `${svgNum(activityTooltip.y)}px`
              }}
            >
              <h4>{tooltipActivity.title}</h4>
              <p>
                {text.tooltipCategory}: {tooltipCategoryLabel}
              </p>
              {tooltipTagsLabel ? (
                <p>
                  {text.tooltipTags}: {tooltipTagsLabel}
                </p>
              ) : null}
              <p>
                {text.tooltipFrom}: {tooltipStartLabel}
              </p>
              <p>
                {text.tooltipTo}: {tooltipEndLabel}
              </p>
            </div>
          ) : null}
        </section>
      </section>

      <section className="side-panels">
        <aside className="filter-sidebar">
          <header className="filter-sidebar-header">
            <h2>{activeTenant?.name || text.sidebarTitle}</h2>
            <div className="sidebar-user-row">
              <span>{session?.user?.email ?? ""}</span>
              <button type="button" className="sidebar-signout-btn" onClick={() => signOut()}>
                {text.signOut}
              </button>
            </div>
            <div className="sidebar-user-meta">
              <p>
                {text.userRoleLabel}: <strong>{currentRoleLabel}</strong>
              </p>
            </div>
            <div className="sidebar-utility-stack">
              <div className="sidebar-utility-actions">
                <button
                  type="button"
                  className="copy-wheel-trigger"
                  aria-label={text.copyWheel}
                  title={text.copyWheel}
                  onClick={copyVisibleWheel}
                >
                  <span className="icon-glyph" aria-hidden>
                    ⧉
                  </span>
                </button>
                <div className="sharing-menu">
                  <button
                    ref={sharingTriggerRef}
                    type="button"
                    className="sharing-trigger"
                    aria-label={text.openSharing}
                    title={text.sharingTitle}
                    aria-expanded={isSharingOpen}
                    aria-controls="sharing-dialog"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setIsSharingOpen((open) => !open);
                    }}
                  >
                    <span className="icon-glyph" aria-hidden>
                      ↗
                    </span>
                  </button>
                </div>
                <div className="settings-menu">
                  <button
                    ref={settingsTriggerRef}
                    type="button"
                    className="settings-trigger"
                    aria-label={text.openSettings}
                    aria-expanded={isSettingsOpen}
                    aria-controls="settings-dialog"
                    onClick={() => {
                      setIsSharingOpen(false);
                      setIsSettingsOpen((open) => !open);
                    }}
                  >
                    <span className="icon-glyph" aria-hidden>
                      ⚙
                    </span>
                  </button>
                </div>
              </div>
              {copyNotice ? (
                <span className="sidebar-copy-status" role="status" aria-live="polite">
                  {copyNotice}
                </span>
              ) : null}
            </div>
          </header>
          <section className="filter-sidebar-section wheel-selector-section">
            {userTenants.length > 0 ? (
              <div className="tenant-picker-row">
                <label className="tenant-picker-label">
                  {text.adminTenantField}
                  <select
                    value={activeTenantId ?? ""}
                    onChange={(event) => {
                      const nextTenantId = event.target.value;
                      void applyActiveTenant(nextTenantId, { persist: true, closeChooser: true });
                    }}
                    disabled={isSwitchingTenant || userTenants.length <= 1}
                  >
                    {userTenants.map((membership) => (
                      <option key={membership.tenantId} value={membership.tenantId}>
                        {membership.tenant.name} ({membership.tenant.slug})
                      </option>
                    ))}
                  </select>
                </label>
                {canUseAdminSetup ? (
                  <button
                    type="button"
                    className="ring-edit-trigger tenant-admin-trigger"
                    aria-label={text.adminSetup}
                    title={text.adminSetup}
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setIsAdminSetupOpen(true);
                      void loadAdminData();
                    }}
                    disabled={isSwitchingTenant || !activeTenantId}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path
                        d="M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.28 7.28 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7.28 7.28 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.49 7.49 0 0 0-.05.94 7.49 7.49 0 0 0 .05.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.58-.24 1.12-.55 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="filter-sidebar-section-head wheel-selector-header">
              <h3>{text.wheelField}</h3>
              <button type="button" className="secondary wheel-create-trigger" onClick={createWheelFromUi} disabled={isWheelBusy || !activeTenantId}>
                + {text.createWheel}
              </button>
            </div>
            <div className="wheel-list">
              {wheels.map((wheel) => {
                const isActive = wheel.id === activeWheelId;
                return (
                  <div key={`wheel-row-${wheel.id}`} className="wheel-list-row">
                    <button
                      type="button"
                      className={`wheel-list-item${isActive ? " is-active" : ""}`}
                      aria-pressed={isActive}
                      onClick={() => setActiveWheelId(wheel.id)}
                      disabled={isHydratingWheel || isWheelBusy || !activeTenantId}
                    >
                      <span className="wheel-list-name">{wheel.title}</span>
                    </button>
                    <div className="ring-row-actions">
                      <button
                        type="button"
                        className="ring-edit-trigger"
                        aria-label={`${text.renameWheel}: ${wheel.title}`}
                        onClick={() => openWheelRenameDialog(wheel.id)}
                        disabled={isWheelBusy || !activeTenantId}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden>
                          <path
                            d="M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.28 7.28 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7.28 7.28 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.49 7.49 0 0 0-.05.94 7.49 7.49 0 0 0 .05.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.58-.24 1.12-.55 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="ring-delete-trigger"
                        aria-label={`${text.deleteWheel}: ${wheel.title}`}
                        onClick={() => {
                          void deleteWheelFromUi(wheel.id);
                        }}
                        disabled={isWheelBusy || !activeTenantId}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <div className="sidebar-primary-actions">
            <button
              type="button"
              className="category-add-trigger"
              onClick={openCategoryModal}
              disabled={!activeWheelId || isHydratingWheel}
            >
              + {text.openCategoryModal}
            </button>
            <button
              type="button"
              className="activity-add-trigger"
              onClick={openCreateActivityModal}
              disabled={!activeWheelId || isHydratingWheel}
            >
              + {text.openActivityModal}
            </button>
          </div>
          {isHydratingWheel ? <p className="status-chip">{text.loading}</p> : null}
          {isSwitchingTenant ? <p className="status-chip">{text.loading}</p> : null}
          {tenantScopeError ? <p className="status-chip is-error">{tenantScopeError}</p> : null}
          {loadError ? <p className="status-chip is-error">{loadError}</p> : null}
          {saveError ? <p className="status-chip is-error">{saveError}</p> : null}

          <section className="filter-sidebar-section">
            <p className="filter-sidebar-label">{text.filterViewTitle}</p>
            <input
              className="filter-search-input"
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
              placeholder={text.searchFiltersPlaceholder}
            />
          </section>

          <section className="filter-sidebar-section">
            <div className="filter-sidebar-section-head">
              <h3>{text.ringsSectionTitle}</h3>
            </div>
            <div className="filter-show-row">
              <span>{text.showLabel}:</span>
              <button type="button" onClick={showAllCategories}>
                {text.showAll}
              </button>
              <span>|</span>
              <button type="button" onClick={hideAllCategories}>
                {text.showNone}
              </button>
            </div>
            <div className="ring-filter-list">
              {filteredRingsForMenu.length > 0 ? (
                filteredRingsForMenu.map((ring) => {
                  const isActive = activeCategorySet.has(ring.id);
                  return (
                    <div key={`ring-filter-${ring.id}`} className={`ring-filter-row${isActive ? " is-active" : ""}`}>
                      <button
                        type="button"
                        className={`ring-filter-item${isActive ? " is-active" : ""}`}
                        aria-pressed={isActive}
                        onClick={() => toggleCategory(ring.id)}
                      >
                        <span className="ring-filter-dot" style={{ background: ring.accent }} />
                        <span className="ring-filter-name">{ring.label}</span>
                        <span className="ring-filter-count">{ringActivityCountById.get(ring.id) ?? 0}</span>
                      </button>
                      <div className="ring-row-actions">
                        <button
                          type="button"
                          className="ring-edit-trigger"
                          aria-label={`${text.editRing}: ${ring.label}`}
                          onClick={() => openEditRingModal(ring.id)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden>
                            <path
                              d="M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.28 7.28 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7.28 7.28 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.49 7.49 0 0 0-.05.94 7.49 7.49 0 0 0 .05.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.58-.24 1.12-.55 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="ring-delete-trigger"
                          aria-label={`${text.deleteRing}: ${ring.label}`}
                          onClick={() => deleteRing(ring.id)}
                          disabled={ringTemplates.length <= 1 || isWheelBusy}
                        >
                          <span aria-hidden>×</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="filter-empty">{text.noMatches}</p>
              )}
            </div>
          </section>

          <section className="filter-sidebar-section">
            <div className="filter-sidebar-section-head">
              <h3>{text.activitiesSectionTitle}</h3>
            </div>
            <div className="activity-filter-list">
              {filteredActivitySummary.length > 0 ? (
                filteredActivitySummary.map((entry) => (
                  <div key={`activity-filter-${entry.id}`} className="activity-filter-item">
                    <span className="activity-filter-dot" style={{ background: entry.color }} />
                    <span className="activity-filter-name">{entry.title}</span>
                    <span className="activity-filter-count">{entry.count}</span>
                  </div>
                ))
              ) : (
                <p className="filter-empty">{text.noMatches}</p>
              )}
            </div>
          </section>

          <section className="filter-sidebar-section">
            <div className="filter-sidebar-section-head">
              <h3>{text.tagsSectionTitle}</h3>
            </div>
            <div className="tag-filter-list">
              <button
                type="button"
                className={`tag-filter-chip${activeTagKeySet.size === 0 ? " is-active" : ""}`}
                aria-pressed={activeTagKeySet.size === 0}
                onClick={clearTagFilters}
              >
                {text.showAll}
              </button>
              {filteredTagsForMenu.length > 0 ? (
                filteredTagsForMenu.map((tag) => {
                  const isActive = activeTagKeySet.has(tag.key);
                  return (
                    <button
                      key={`tag-filter-${tag.key}`}
                      type="button"
                      className={`tag-filter-chip${isActive ? " is-active" : ""}`}
                      aria-pressed={isActive}
                      onClick={() => toggleTagFilter(tag.key)}
                      onMouseEnter={(event) => onTagHoverStart(tag, event)}
                      onMouseMove={onTagHoverMove}
                      onMouseLeave={onTagHoverEnd}
                    >
                      <span className="tag-filter-chip-dot" style={{ background: tag.color }} />
                      <span className="tag-filter-chip-label">{tag.label}</span>
                      <span className="tag-filter-chip-count">{tag.count}</span>
                    </button>
                  );
                })
              ) : (
                <p className="filter-empty">{text.noMatches}</p>
              )}
            </div>
          </section>

        </aside>

      </section>

      {isSettingsOpen ? (
        <div className="activity-modal-backdrop">
          <section
            id="settings-dialog"
            ref={settingsPopoverRef}
            className="editor-panel activity-modal settings-modal"
            aria-label={text.settingsTitle}
          >
            <header className="activity-modal-header">
              <h2>{text.settingsTitle}</h2>
              <button
                type="button"
                className="activity-modal-close"
                onClick={() => setIsSettingsOpen(false)}
                aria-label={text.closeSettings}
              >
                x
              </button>
            </header>
            <p className="settings-personal-hint">{text.settingsPersonalHint}</p>
            <section className="settings-theme-field" aria-label={text.theme}>
              <h4>{text.theme}</h4>
              <div className="theme-choice-grid">
                {Object.values(THEME_PRESETS).map((preset) => {
                  const isActive = preset.id === themeId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`theme-choice${isActive ? " is-active" : ""}`}
                      aria-pressed={isActive}
                      onClick={() => setThemeId(preset.id)}
                    >
                      <span className="theme-choice-name">{preset.name}</span>
                      <span className="theme-choice-swatches" aria-hidden>
                        {preset.ringPalette.slice(0, 5).map((entry, index) => (
                          <span
                            key={`${preset.id}-swatch-${index}`}
                            className="theme-choice-swatch"
                            style={{ background: `linear-gradient(135deg, ${entry.color}, ${entry.accent})` }}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
            <label>
              {text.language}
              <select value={language} onChange={(event) => setLanguage(event.target.value as AppLanguage)}>
                <option value="nb">{text.languageNb}</option>
                <option value="en">{text.languageEn}</option>
              </select>
            </label>
            <label>
              {text.periodAnchoring}
              <select
                value={windowAnchorMode}
                onChange={(event) => setWindowAnchorMode(event.target.value as WindowAnchorMode)}
              >
                <option value="dynamic_today">{text.dynamicAnchoring}</option>
                <option value="manual">{text.manualAnchoring}</option>
              </select>
            </label>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={seamShadowEnabled}
                onChange={(event) => setSeamShadowEnabled(event.target.checked)}
              />
              <span>{text.seamShadow}</span>
            </label>
          </section>
        </div>
      ) : null}

      {isSharingOpen ? (
        <div className="activity-modal-backdrop">
          <section
            id="sharing-dialog"
            ref={sharingPopoverRef}
            className="editor-panel activity-modal sharing-modal"
            aria-label={text.sharingTitle}
          >
            <header className="activity-modal-header">
              <h2>{text.sharingTitle}</h2>
              <button
                type="button"
                className="activity-modal-close"
                onClick={() => setIsSharingOpen(false)}
                aria-label={text.closeSharing}
              >
                x
              </button>
            </header>

            <section className="settings-share-field" aria-label={text.sharingTitle}>
              <label>
                {text.shareRoleField}
                <select value={shareRole} onChange={(event) => setShareRole(event.target.value as "VIEWER" | "EDITOR" | "OWNER")}>
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                  <option value="OWNER">Owner</option>
                </select>
              </label>
              <div className="settings-share-row">
                <label className="settings-share-inline-label">
                  <span>{text.shareUserPickerField}</span>
                  <select
                    value={shareUserSelectionEmail}
                    onChange={(event) => {
                      const email = event.target.value;
                      setShareUserSelectionEmail(email);
                      setShareUserEmail(email);
                    }}
                  >
                    <option value="">{text.shareUserPickerPlaceholder}</option>
                    {shareableUsers.map((user) => (
                      <option key={user.id} value={user.email ?? ""}>
                        {user.name ? `${user.name} (${user.email ?? "-"})` : (user.email ?? "-")}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={shareWithUser}
                  disabled={isSharingBusy || !(shareUserSelectionEmail || shareUserEmail).trim()}
                >
                  {text.shareUserAction}
                </button>
              </div>
              <div className="settings-share-row">
                <input
                  value={shareGroupId}
                  placeholder={text.shareGroupPlaceholder}
                  onChange={(event) => setShareGroupId(event.target.value)}
                />
                <button type="button" onClick={shareWithGroup} disabled={isSharingBusy || !shareGroupId.trim()}>
                  {text.shareGroupAction}
                </button>
              </div>
              <div className="settings-share-list">
                {shares.length > 0 ? (
                  shares.map((entry) => {
                    const label =
                      entry.targetType === "USER"
                        ? entry.user?.email || entry.user?.name || "user"
                        : entry.group?.displayName || entry.group?.tenantGroupId || "group";
                    return (
                      <div key={entry.id} className="settings-share-item">
                        <span>{label}</span>
                        <span>{entry.role}</span>
                        <button type="button" onClick={() => removeShare(entry)} disabled={isSharingBusy}>
                          {text.removeShare}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="settings-share-empty">{text.noShares}</p>
                )}
              </div>
            </section>
          </section>
        </div>
      ) : null}

      {isTenantChooserOpen ? (
        <div className="activity-modal-backdrop">
          <section className="editor-panel activity-modal" aria-label="Choose tenant">
            <header className="activity-modal-header">
              <h2>{text.adminTenantField}</h2>
            </header>
            <p className="admin-meta">Choose which tenant you want to work in for this session.</p>
            <label>
              {text.adminTenantField}
              <select value={tenantChooserId} onChange={(event) => setTenantChooserId(event.target.value)}>
                {userTenants.map((membership) => (
                  <option key={membership.tenantId} value={membership.tenantId}>
                    {membership.tenant.name} ({membership.tenant.slug})
                  </option>
                ))}
              </select>
            </label>
            <div className="advanced-setup-actions">
              <button
                type="button"
                onClick={() => {
                  if (!tenantChooserId) {
                    return;
                  }
                  void applyActiveTenant(tenantChooserId, { persist: true, closeChooser: true });
                }}
                disabled={!tenantChooserId || isSwitchingTenant}
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isAdminSetupOpen ? (
        <div className="activity-modal-backdrop">
          <section
            ref={adminSetupModalRef}
            className="editor-panel activity-modal admin-setup-modal"
            aria-label={text.adminSetupTitle}
          >
            <header className="activity-modal-header">
              <h2>{text.adminSetupTitle}</h2>
              <button
                type="button"
                className="activity-modal-close"
                onClick={() => {
                  setIsAzureSetupDialogOpen(false);
                  setIsAdminSetupOpen(false);
                }}
                aria-label={text.closeAdminSetup}
              >
                x
              </button>
            </header>
            <p className="admin-meta">{text.adminSetupHint}</p>

            <div className="admin-setup-toolbar">
              <button type="button" className="secondary" onClick={() => setIsUserAdminDialogOpen(true)}>
                {text.adminOpenUserAdmin}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setIsAzureSetupDialogOpen(true)}
              >
                {text.adminOpenAzureSetup}
              </button>
            </div>

            {adminError ? <p className="status-chip is-error">{adminError}</p> : null}

            <section className="admin-users-block admin-scope-card" aria-label={text.adminTenantSectionTitle}>
              <h3>{text.adminTenantSectionTitle}</h3>
              <p className="admin-meta">{text.adminScopeHint}</p>
              <label>
                {text.adminTenantField}
                <select
                  value={activeAdminTenantId}
                  onChange={(event) => {
                    const nextTenantId = event.target.value;
                    if (!nextTenantId || nextTenantId === activeAdminTenantId) {
                      return;
                    }
                    setActiveAdminTenantId(nextTenantId);
                    void (async () => {
                      try {
                        setIsAdminLoading(true);
                        setAdminError("");
                        const [overviewPayload] = await Promise.all([
                          requestJson<{ overview: AdminOverviewModel }>(
                            `/api/admin/overview?tenantId=${encodeURIComponent(nextTenantId)}`
                          ),
                          loadAdminTenantContext(nextTenantId),
                          loadAdminTenantSettings(nextTenantId)
                        ]);
                        setAdminOverview(overviewPayload.overview);
                      } catch {
                        setAdminError(text.adminLoadFailed);
                      } finally {
                        setIsAdminLoading(false);
                      }
                    })();
                  }}
                  disabled={isAdminLoading || adminTenants.length === 0}
                >
                  {adminTenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.slug})
                    </option>
                  ))}
                </select>
              </label>

              <p className="admin-meta">
                {activeAdminTenant ? `${activeAdminTenant.name} (${activeAdminTenant.slug})` : text.adminTenantUnavailable}
              </p>
              <p className="filter-empty">{text.adminTenantManagedBySystemAdmin}</p>
            </section>

            <section className="admin-users-block admin-scope-card" aria-label={text.smtpSettingsTitle}>
              <h3>{text.smtpSettingsTitle}</h3>
              <p className="admin-meta">{text.smtpSettingsHint}</p>
              <div className="admin-form-grid admin-smtp-grid">
                <label>
                  {text.smtpHostField}
                  <input value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} placeholder="smtp.example.com" />
                </label>
                <label>
                  {text.smtpPortField}
                  <input value={smtpPort} onChange={(event) => setSmtpPort(event.target.value)} placeholder="587" />
                </label>
                <label>
                  {text.smtpUserField}
                  <input value={smtpUser} onChange={(event) => setSmtpUser(event.target.value)} placeholder="smtp-user" />
                </label>
                <label>
                  {text.smtpPassField}
                  <input
                    type="password"
                    value={smtpPass}
                    onChange={(event) => setSmtpPass(event.target.value)}
                    placeholder="••••••••"
                  />
                </label>
                <label>
                  {text.smtpFromField}
                  <input value={smtpFrom} onChange={(event) => setSmtpFrom(event.target.value)} placeholder="noreply@tenant.no" />
                </label>
                <label>
                  {text.smtpReplyToField}
                  <input value={smtpReplyTo} onChange={(event) => setSmtpReplyTo(event.target.value)} placeholder="support@tenant.no" />
                </label>
                <label className="admin-field-full">
                  {text.smtpTestToField}
                  <input value={smtpTestTo} onChange={(event) => setSmtpTestTo(event.target.value)} placeholder="bruker@domene.no" />
                </label>
                <label className="admin-check-option admin-field-full">
                  <input type="checkbox" checked={smtpSecure} onChange={(event) => setSmtpSecure(event.target.checked)} />
                  <span>{text.smtpSecureField}</span>
                </label>
              </div>
              <div className="admin-section-actions">
                <button type="button" onClick={saveSmtpSetupForTenant} disabled={isSmtpSaving || !activeAdminTenantId}>
                  {text.smtpSaveAction}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={sendSmtpTestEmail}
                  disabled={isSmtpTesting || !activeAdminTenantId || !smtpTestTo.trim()}
                >
                  {text.smtpTestAction}
                </button>
              </div>
              {smtpNotice ? <p className="status-chip">{smtpNotice}</p> : null}
            </section>

            {adminOverview ? (
              <section className="admin-overview-grid" aria-label={text.adminOverviewTitle}>
                <article className="admin-overview-item">
                  <h4>{text.adminTotalUsers}</h4>
                  <p>{adminOverview.users}</p>
                </article>
                <article className="admin-overview-item">
                  <h4>{text.adminTotalWheels}</h4>
                  <p>{adminOverview.wheels}</p>
                </article>
                <article className="admin-overview-item">
                  <h4>{text.adminTotalActivities}</h4>
                  <p>{adminOverview.activities}</p>
                </article>
                <article className="admin-overview-item">
                  <h4>{text.adminTotalShares}</h4>
                  <p>{adminOverview.shares}</p>
                </article>
                <article className="admin-overview-item">
                  <h4>{text.adminTotalGroups}</h4>
                  <p>{adminOverview.groups}</p>
                </article>
                <article className="admin-overview-item">
                  <h4>{text.adminTotalAccounts}</h4>
                  <p>{adminOverview.accounts}</p>
                </article>
                <article className="admin-overview-item">
                  <h4>{text.adminLocalAccounts}</h4>
                  <p>{adminOverview.localAccounts}</p>
                </article>
                <article className="admin-overview-item">
                  <h4>{text.adminAzureAccounts}</h4>
                  <p>{adminOverview.azureAccounts}</p>
                </article>
              </section>
            ) : null}

            <div className="advanced-setup-actions admin-setup-bottom-actions">
              <button type="button" className="secondary" onClick={() => setIsAdminSetupOpen(false)}>
                {text.closeAdminSetup}
              </button>
            </div>

            {isAzureSetupDialogOpen ? (
              <div className="activity-modal-backdrop admin-child-backdrop">
                <section
                  ref={azureSetupDialogRef}
                  className="editor-panel activity-modal azure-setup-modal"
                  aria-label={text.advancedSetupTitle}
                >
                  <header className="activity-modal-header">
                    <h2>{text.advancedSetupTitle}</h2>
                    <button
                      type="button"
                      className="activity-modal-close"
                      onClick={() => setIsAzureSetupDialogOpen(false)}
                      aria-label={text.closeAdvancedSetup}
                    >
                      x
                    </button>
                  </header>

                  <section className="advanced-setup-block">
                    <h3>{text.azureSetupHow}</h3>
                    <p>{text.azureSetupStep1}</p>
                    <p>{text.azureSetupStep2}</p>
                    <p>{text.azureSetupStep3}</p>
                    <p>{text.azureSetupStep4}</p>
                    <p>{text.azureSetupStep5}</p>
                  </section>

                  <label>
                    {text.azureCallbackUri}
                    <input value={azureCallbackUri} readOnly />
                  </label>

                  <label>
                    {text.azureTenantId}
                    <input value={azureTenantId} onChange={(event) => setAzureTenantId(event.target.value)} />
                  </label>

                  <label>
                    {text.azureClientId}
                    <input value={azureClientId} onChange={(event) => setAzureClientId(event.target.value)} />
                  </label>

                  <label>
                    {text.azureClientSecret}
                    <input
                      type="password"
                      value={azureClientSecret}
                      onChange={(event) => setAzureClientSecret(event.target.value)}
                    />
                  </label>

                  <div className="advanced-setup-actions">
                    <button
                      type="button"
                      onClick={saveAzureSetupForTenant}
                      disabled={
                        isAzureSetupSaving ||
                        !activeAdminTenantId ||
                        !azureTenantId.trim() ||
                        !azureClientId.trim() ||
                        !azureClientSecret.trim()
                      }
                    >
                      {text.azureCopyEnv}
                    </button>
                    <button type="button" className="secondary" onClick={() => setIsAzureSetupDialogOpen(false)}>
                      {text.closeAdvancedSetup}
                    </button>
                  </div>
                  {azureCopyNotice ? <p className="status-chip">{azureCopyNotice}</p> : null}
                </section>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {isUserAdminDialogOpen ? (
        <div className="activity-modal-backdrop">
          <section
            ref={userAdminDialogRef}
            className="editor-panel activity-modal user-admin-modal"
            aria-label={text.userAdminTitle}
          >
            <header className="activity-modal-header">
              <h2>{text.userAdminTitle}</h2>
              <button
                type="button"
                className="activity-modal-close"
                onClick={() => {
                  closeAdminUserEditor();
                  setIsUserAdminDialogOpen(false);
                }}
                aria-label={text.closeUserAdmin}
              >
                x
              </button>
            </header>

            <p className="admin-meta">{text.adminUsersHint}</p>

            <section className="admin-users-block">
              <div className="admin-user-top-actions">
                <button type="button" onClick={openCreateAdminUserEditor} disabled={isAdminUserSaving || !activeAdminTenantId}>
                  {text.adminCreateUser}
                </button>
              </div>
              <div className="user-admin-filters">
                <label>
                  {text.userAdminSearch}
                  <input
                    value={userAdminFilterQuery}
                    onChange={(event) => setUserAdminFilterQuery(event.target.value)}
                    placeholder={text.userAdminSearch}
                  />
                </label>
                <label>
                  {text.userAdminRoleFilter}
                  <select
                    value={userAdminFilterRole}
                    onChange={(event) => setUserAdminFilterRole(event.target.value as "ALL" | "ADMIN" | "MEMBER")}
                  >
                    <option value="ALL">{text.userAdminFilterAll}</option>
                    <option value="ADMIN">{text.userAdminFilterAdmins}</option>
                    <option value="MEMBER">{text.userAdminFilterMembers}</option>
                  </select>
                </label>
                <label>
                  {text.userAdminStatusFilter}
                  <select
                    value={userAdminFilterStatus}
                    onChange={(event) => setUserAdminFilterStatus(event.target.value as "ALL" | "ACTIVE" | "DISABLED")}
                  >
                    <option value="ALL">{text.userAdminFilterAll}</option>
                    <option value="ACTIVE">{text.userAdminFilterActive}</option>
                    <option value="DISABLED">{text.userAdminFilterDisabled}</option>
                  </select>
                </label>
              </div>

              <div className="user-admin-table">
                <div className="user-admin-row user-admin-head">
                  <span>{text.adminUserName}</span>
                  <span>{text.adminUserEmail}</span>
                  <span>{text.adminUserRoles}</span>
                  <span>{text.adminUserStatus}</span>
                  <span>{text.adminUserProviders}</span>
                  <span>{text.adminUserLastLogin}</span>
                  <span>{text.adminActions}</span>
                </div>
                {filteredAdminUsers.length > 0 ? (
                  filteredAdminUsers.map((user) => (
                    <div key={user.id} className="user-admin-row">
                      <span>{user.name || "-"}</span>
                      <span>{user.email || "-"}</span>
                      <span>{user.isAdmin ? text.roleTenantAdmin : text.roleTenantMember}</span>
                      <span>{user.isDisabled ? text.adminUserStatusDisabled : text.adminUserStatusActive}</span>
                      <span>{user.providers.join(", ") || (user.hasLocalPassword ? "credentials" : "-")}</span>
                      <span>
                        {user.lastLoginAt
                          ? DateTime.fromISO(user.lastLoginAt, { zone: TIMEZONE }).toFormat("yyyy-LL-dd HH:mm")
                          : "-"}
                      </span>
                      <div className="user-admin-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => openAdminUserEditor(user)}
                          disabled={isAdminLoading || isAdminUserSaving}
                        >
                          {text.adminEditUser}
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleTenantUserDisabled(user)}
                          disabled={isAdminLoading || isAdminUserSaving || session?.user?.id === user.id}
                        >
                          {user.isDisabled ? text.adminEnableUser : text.adminDisableUser}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void deleteTenantUser(user)}
                          disabled={isAdminLoading || isAdminUserSaving || session?.user?.id === user.id}
                        >
                          {text.adminDeleteUser}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="filter-empty">{text.adminNoUsers}</p>
                )}
              </div>
            </section>

            <div className="advanced-setup-actions admin-setup-bottom-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  closeAdminUserEditor();
                  setIsUserAdminDialogOpen(false);
                }}
              >
                {text.closeUserAdmin}
              </button>
            </div>

            {adminUserEditorMode ? (
              <div className="activity-modal-backdrop admin-child-backdrop">
                <section
                  className="editor-panel activity-modal admin-user-edit-modal"
                  aria-label={adminUserEditorMode === "create" ? text.adminNewUserTitle : text.adminEditUser}
                >
                  <header className="activity-modal-header">
                    <h2>{adminUserEditorMode === "create" ? text.adminNewUserTitle : text.adminEditUser}</h2>
                    <button
                      type="button"
                      className="activity-modal-close"
                      onClick={closeAdminUserEditor}
                      aria-label={text.adminCancelEditUser}
                    >
                      x
                    </button>
                  </header>
                  <p className="admin-meta">{text.adminEditUserHint}</p>
                  <div className="admin-form-grid admin-user-edit-grid">
                    <label>
                      {text.adminNewUserNameField}
                      <input value={editingAdminUserName} onChange={(event) => setEditingAdminUserName(event.target.value)} />
                    </label>
                    <label>
                      {text.adminNewUserEmailField}
                      <input
                        type="email"
                        value={editingAdminUserEmail}
                        onChange={(event) => setEditingAdminUserEmail(event.target.value)}
                      />
                    </label>
                    <label>
                      {adminUserEditorMode === "create" ? text.adminNewUserPasswordField : text.adminPasswordOptional}
                      <input
                        type="password"
                        value={editingAdminUserPassword}
                        onChange={(event) => setEditingAdminUserPassword(event.target.value)}
                        placeholder="••••••••"
                      />
                    </label>
                    <label className="admin-check-option">
                      <input
                        type="checkbox"
                        checked={editingAdminUserIsAdmin}
                        onChange={(event) => setEditingAdminUserIsAdmin(event.target.checked)}
                      />
                      <span>{text.adminNewUserAdminToggle}</span>
                    </label>
                    {adminUserEditorMode === "edit" ? (
                      <label className="admin-check-option">
                        <input
                          type="checkbox"
                          checked={editingAdminUserIsDisabled}
                          onChange={(event) => setEditingAdminUserIsDisabled(event.target.checked)}
                          disabled={session?.user?.id === editingAdminUserId}
                        />
                        <span>{text.adminUserStatusDisabled}</span>
                      </label>
                    ) : null}
                  </div>
                  <div className="admin-section-actions">
                    <button
                      type="button"
                      onClick={saveTenantUserEdits}
                      disabled={
                        isAdminUserSaving ||
                        !activeAdminTenantId ||
                        !editingAdminUserEmail.trim() ||
                        (adminUserEditorMode === "create"
                          ? editingAdminUserPassword.length < 8
                          : editingAdminUserPassword.length > 0 && editingAdminUserPassword.length < 8)
                      }
                    >
                      {adminUserEditorMode === "create" ? text.adminCreateUser : text.adminSaveUser}
                    </button>
                    <button type="button" className="secondary" onClick={closeAdminUserEditor} disabled={isAdminUserSaving}>
                      {text.adminCancelEditUser}
                    </button>
                  </div>
                </section>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {tagTooltip ? (
        <div
          className="tag-description-tooltip"
          role="status"
          aria-live="polite"
          style={{ left: `${tagTooltip.x + 14}px`, top: `${tagTooltip.y + 16}px` }}
        >
          <h5>
            <span className="tag-description-tooltip-dot" style={{ background: tagTooltip.color }} />
            <span>{tagTooltip.label}</span>
          </h5>
          <p>
            {text.tagDescriptionTooltipPrefix}: {tagTooltip.description}
          </p>
        </div>
      ) : null}

      {isActivityModalOpen ? (
        <div className="activity-modal-backdrop">
          <section ref={activityModalRef} className="editor-panel activity-modal" aria-label={text.activityTitle}>
            <header className="activity-modal-header">
              <h2>{selectedActivity ? text.activityModalEdit : text.activityModalNew}</h2>
              <button
                type="button"
                className="activity-modal-close"
                onClick={() => {
                  onTagHoverEnd();
                  setIsTagDialogOpen(false);
                  setIsScheduleDialogOpen(false);
                  setIsActivityModalOpen(false);
                }}
                aria-label={text.closeActivityModal}
              >
                x
              </button>
            </header>
            <p className="hint">{text.activityHint}</p>

            <label>
              {text.titleField}
              <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
            </label>

            <label>
              {text.ringField}
              <select
                value={selectedSlot?.ringId ?? visibleRings[0]?.id ?? ""}
                onChange={(event) => {
                  const ringId = event.target.value;
                  if (selectedSlot) {
                    setSelectedSlot({ ...selectedSlot, ringId });
                  } else {
                    const start = DateTime.fromJSDate(scale.startAt, { zone: TIMEZONE });
                    setSelectedSlot({
                      ringId,
                      startAt: toIso(start) ?? `${startDate}T00:00:00`,
                      endAt: toIso(start.plus({ weeks: 1 })) ?? `${startDate}T00:00:00`
                    });
                  }
                  const ring = themedRings.find((entry) => entry.id === ringId);
                  if (ring) {
                    setDraftColor(ring.accent);
                  }
                }}
              >
                {visibleRings.map((ring) => (
                  <option key={ring.id} value={ring.id}>
                    {ring.label}
                  </option>
                ))}
              </select>
            </label>

            <section className="activity-tags-field" aria-label={text.tagsField}>
              <div className="activity-tags-header">
                <span>{text.existingTagsTitle}</span>
                <button type="button" onClick={openTagDialog}>
                  {text.openTagsDialog}
                </button>
              </div>
              <div className="activity-tags-chip-list">
                {tags.length > 0 ? (
                  tags.map((tag) => {
                    const isSelected = draftTagIds.includes(tag.id);
                    return (
                      <button
                        key={`selected-tag-${tag.id}`}
                        type="button"
                        className={`activity-tag-chip${isSelected ? " is-selected" : ""}`}
                        aria-pressed={isSelected}
                        onClick={() => toggleDraftTag(tag.id)}
                        onMouseEnter={(event) => onTagHoverStart(tag, event)}
                        onMouseMove={onTagHoverMove}
                        onMouseLeave={onTagHoverEnd}
                      >
                        <span className="activity-tag-chip-dot" style={{ background: tag.color }} />
                        <span>{tag.label}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="activity-tags-empty">{text.noTagsAvailable}</p>
                )}
              </div>
              {selectedDraftTags.length === 0 ? (
                <p className="activity-tags-empty">{text.noTagsSelected}</p>
              ) : null}
            </section>

            <label>
              {text.startField}
              <input
                type="date"
                value={
                  selectedSlot
                    ? parseIso(selectedSlot.startAt).toISODate() ?? DateTime.fromISO(startDate).toISODate() ?? ""
                    : DateTime.fromISO(startDate).toISODate() ?? ""
                }
                onChange={(event) => onSlotDateChange("startAt", event.target.value)}
              />
            </label>

            <label>
              {text.endField}
              <input
                type="date"
                value={
                  selectedSlot
                    ? parseIso(selectedSlot.endAt).toISODate() ?? DateTime.fromISO(startDate).toISODate() ?? ""
                    : DateTime.fromISO(startDate).plus({ days: 7 }).toISODate() ?? ""
                }
                onChange={(event) => onSlotDateChange("endAt", event.target.value)}
              />
            </label>

            <label>
              {text.colorField}
              <input type="color" value={draftColor} onChange={(event) => setDraftColor(event.target.value)} />
            </label>

            <section className="activity-schedule-field" aria-label={text.advancedScheduleField}>
              <div className="activity-tags-header">
                <span>{text.advancedScheduleField}</span>
                <button type="button" onClick={openScheduleDialog}>
                  {text.openScheduleDialog}
                </button>
              </div>
              <p className="activity-schedule-summary">{scheduleSummaryLabel}</p>
            </section>

            {isScheduleDialogOpen ? (
              <div className="activity-tags-dialog-backdrop">
                <section
                  ref={activityScheduleDialogRef}
                  className="activity-tags-dialog"
                  aria-label={text.scheduleDialogTitle}
                >
                  <header className="activity-tags-dialog-header">
                    <h3>{text.scheduleDialogTitle}</h3>
                    <button
                      type="button"
                      className="activity-modal-close"
                      onClick={closeScheduleDialog}
                      aria-label={text.closeScheduleDialog}
                    >
                      x
                    </button>
                  </header>

                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={draftSchedule.isEnabled}
                      onChange={(event) => setDraftSchedule((prev) => ({ ...prev, isEnabled: event.target.checked }))}
                    />
                    <span>{text.scheduleEnabledField}</span>
                  </label>

                  <label htmlFor="schedule-cadence">
                    {text.scheduleCadenceField}
                    <select
                      id="schedule-cadence"
                      value={draftSchedule.cadence}
                      onChange={(event) =>
                        setDraftSchedule((prev) => ({ ...prev, cadence: event.target.value as ActivityCadence }))
                      }
                    >
                      <option value="NONE">{text.scheduleCadenceNone}</option>
                      <option value="ONCE">{text.scheduleCadenceOnce}</option>
                      <option value="DAILY">{text.scheduleCadenceDaily}</option>
                      <option value="WEEKLY">{text.scheduleCadenceWeekly}</option>
                      <option value="MONTHLY">{text.scheduleCadenceMonthly}</option>
                    </select>
                  </label>

                  <label htmlFor="schedule-deadline">
                    {text.scheduleDeadlineField}
                    <input
                      id="schedule-deadline"
                      type="datetime-local"
                      value={draftSchedule.deadlineAt}
                      onChange={(event) =>
                        setDraftSchedule((prev) => ({ ...prev, deadlineAt: event.target.value }))
                      }
                    />
                  </label>

                  <label htmlFor="schedule-timezone">
                    {text.scheduleTimezoneField}
                    <input
                      id="schedule-timezone"
                      value={draftSchedule.timezone}
                      onChange={(event) =>
                        setDraftSchedule((prev) => ({ ...prev, timezone: event.target.value || TIMEZONE }))
                      }
                    />
                  </label>

                  <section className="activity-tags-dialog-block">
                    <h4>{text.scheduleReminderOffsetsField}</h4>
                    <div className="activity-tags-chip-list">
                      {SCHEDULE_REMINDER_OFFSETS.map((offset) => {
                        const active = draftSchedule.reminderOffsetsMinutes.includes(offset);
                        return (
                          <button
                            key={`schedule-offset-${offset}`}
                            type="button"
                            className={`activity-tag-chip${active ? " is-selected" : ""}`}
                            aria-pressed={active}
                            onClick={() => toggleReminderOffset(offset)}
                          >
                            <span>{reminderOffsetLabels.get(offset) ?? `${offset}m`}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <label htmlFor="schedule-reminder-emails">
                    {text.scheduleReminderEmailsField}
                    <input
                      id="schedule-reminder-emails"
                      value={draftReminderEmailsInput}
                      placeholder={text.scheduleReminderEmailPlaceholder}
                      onChange={(event) => setDraftReminderEmailsInput(event.target.value)}
                    />
                  </label>

                  <div className="tag-create-actions">
                    <button type="button" onClick={saveScheduleDialog}>
                      {text.saveSchedule}
                    </button>
                    <button type="button" className="secondary" onClick={closeScheduleDialog}>
                      {text.cancel}
                    </button>
                  </div>
                </section>
              </div>
            ) : null}

            {isTagDialogOpen ? (
              <div className="activity-tags-dialog-backdrop">
                <section ref={activityTagDialogRef} className="activity-tags-dialog" aria-label={text.tagDialogTitle}>
                  <header className="activity-tags-dialog-header">
                    <h3>{text.tagDialogTitle}</h3>
                    <button type="button" className="activity-modal-close" onClick={closeTagDialog} aria-label={text.closeTagsDialog}>
                      x
                    </button>
                  </header>

                  <div className="activity-tags-dialog-block">
                    <h4>{text.existingTagsTitle}</h4>
                    <div className="activity-tag-manage-list">
                      {tags.length > 0 ? (
                        tags.map((tag) => {
                          const isSelected = draftTagIds.includes(tag.id);
                          const isEditing = editingTagId === tag.id;
                          return (
                            <div key={`tag-dialog-${tag.id}`} className={`activity-tag-manage-row${isEditing ? " is-editing" : ""}`}>
                              <button
                                type="button"
                                className={`activity-tag-chip${isSelected ? " is-selected" : ""}`}
                                onClick={() => toggleDraftTag(tag.id)}
                                onMouseEnter={(event) => onTagHoverStart(tag, event)}
                                onMouseMove={onTagHoverMove}
                                onMouseLeave={onTagHoverEnd}
                              >
                                <span className="activity-tag-chip-dot" style={{ background: tag.color }} />
                                <span>{tag.label}</span>
                              </button>
                              <div className="activity-tag-row-actions">
                                <button type="button" className="tag-row-action" onClick={() => openEditTag(tag.id)}>
                                  {text.editTag}
                                </button>
                                <button
                                  type="button"
                                  className="tag-row-action danger"
                                  onClick={() => deleteTag(tag.id)}
                                >
                                  {text.deleteTag}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="activity-tags-empty">{text.noTagsAvailable}</p>
                      )}
                    </div>
                  </div>

                  <form
                    className="tag-create-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      addNewTagFromDialog();
                    }}
                  >
                    <h4>{editingTagId ? text.editTagTitle : text.newTagTitle}</h4>
                    <label htmlFor="new-tag-name">
                      {text.tagNameField}
                      <input
                        id="new-tag-name"
                        value={newTagLabel}
                        placeholder={text.tagNamePlaceholder}
                        maxLength={32}
                        onChange={(event) => setNewTagLabel(event.target.value)}
                      />
                    </label>
                    <label htmlFor="new-tag-description">
                      {text.tagDescriptionField}
                      <textarea
                        id="new-tag-description"
                        value={newTagDescription}
                        placeholder={text.tagDescriptionPlaceholder}
                        maxLength={140}
                        onChange={(event) => setNewTagDescription(event.target.value)}
                      />
                    </label>
                    <label htmlFor="new-tag-color">
                      {text.colorField}
                      <input
                        id="new-tag-color"
                        type="color"
                        value={newTagColor}
                        onChange={(event) => setNewTagColor(normalizeHexColor(event.target.value))}
                      />
                    </label>
                    <div className="tag-create-actions">
                      <button type="submit" disabled={!newTagLabel.trim() || !newTagDescription.trim()}>
                        {editingTagId ? text.updateTag : text.addTag}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={editingTagId ? resetTagEditor : closeTagDialog}
                      >
                        {editingTagId ? text.cancel : text.saveTags}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            ) : null}

            <div className="editor-actions">
              <button type="button" onClick={saveActivity} disabled={!selectedSlot}>
                {selectedActivity ? text.updateActivity : text.addActivity}
              </button>
              <button type="button" className="danger" onClick={deleteActivity} disabled={!selectedActivity}>
                {text.deleteActivity}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isWheelRenameDialogOpen ? (
        <div className="activity-modal-backdrop">
          <section ref={wheelRenameDialogRef} className="editor-panel activity-modal wheel-rename-modal" aria-label={text.renameWheel}>
            <header className="activity-modal-header">
              <h2>{text.renameWheel}</h2>
              <button type="button" className="activity-modal-close" onClick={closeWheelRenameDialog} aria-label={text.cancel}>
                x
              </button>
            </header>
            <form
              className="wheel-rename-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveWheelRenameFromUi();
              }}
            >
              <label htmlFor="wheel-rename-input">
                {text.renameWheelPrompt}
                <input
                  id="wheel-rename-input"
                  value={wheelRenameDraft}
                  maxLength={90}
                  autoFocus
                  onChange={(event) => setWheelRenameDraft(event.target.value)}
                />
              </label>
              <div className="category-modal-actions">
                <button type="button" className="secondary" onClick={closeWheelRenameDialog}>
                  {text.cancel}
                </button>
                <button type="submit" disabled={!wheelRenameDraft.trim() || isWheelBusy}>
                  {text.renameWheel}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isCategoryModalOpen ? (
        <div className="activity-modal-backdrop">
          <section ref={categoryModalRef} className="editor-panel activity-modal category-modal" aria-label={text.categoryModalTitle}>
            <header className="activity-modal-header">
              <h2>{editingRingId ? text.categoryModalEditTitle : text.categoryModalTitle}</h2>
              <button type="button" className="activity-modal-close" onClick={closeCategoryModal} aria-label={text.closeCategoryModal}>
                x
              </button>
            </header>

            <form
              className="category-create"
              onSubmit={(event) => {
                event.preventDefault();
                saveCategoryRing();
              }}
            >
              <label htmlFor="new-category-input">{text.newCategoryField}</label>
              <input
                id="new-category-input"
                value={newCategoryName}
                placeholder={text.newCategoryPlaceholder}
                maxLength={38}
                onChange={(event) => setNewCategoryName(event.target.value)}
                autoFocus
              />
              <label htmlFor="new-category-color">{text.colorField}</label>
              <input
                id="new-category-color"
                type="color"
                value={newCategoryColor}
                onChange={(event) => setNewCategoryColor(normalizeHexColor(event.target.value))}
              />
              <div className="category-modal-actions">
                <button type="button" className="secondary" onClick={closeCategoryModal}>
                  {text.closeCategoryModal}
                </button>
                <button type="submit" disabled={!newCategoryName.trim()}>
                  {editingRingId ? text.saveRing : text.addCategory}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

    </main>
  );
}
