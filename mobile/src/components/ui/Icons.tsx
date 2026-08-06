/**
 * All app icons via lucide-react-native (SVG, premium, clean).
 * NEVER use Unicode text symbols anywhere in the app.
 * Import from here only.
 */
import React from 'react';
import {
  Home, Compass, Plus, List, User, Users,
  Heart, MessageCircle, Share2, Bookmark, BookmarkCheck,
  Bell, Mail, Settings, Lock, Search, Play, Pause,
  Upload, Camera, Video, Image, Music, Film,
  ChevronLeft, ChevronRight, ChevronDown, X, Check, CheckCircle,
  Edit, Edit3, MoreHorizontal, ArrowUp, RefreshCw,
  UserPlus, UserCheck, Eye, Clock, TrendingUp,
  Grid, BarChart2, Sliders, AlertCircle, Info, Trash2, Send,
  Star, Award, Shield, Zap, LogOut, HelpCircle,
  Globe, Volume2, VolumeX, Moon, Sun, FileText,
  AtSign, Hash, Repeat2, ThumbsUp, Smile, Frown, Flag,
  Radio, PenLine, Maximize2, SlidersHorizontal, CornerUpLeft,
  Download, Link, Copy, BookOpen, MessageCircleMore,
} from 'lucide-react-native';
import { COLORS } from '../../constants/theme';

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
}

// ── Factory: create a stable component with defaults ──────────────────────────
function mk(
  C: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number; fill?: string }>,
  def?: Partial<IconProps>,
) {
  return ({ size, color, strokeWidth, fill }: IconProps = {}) => (
    <C
      size={size ?? def?.size ?? 22}
      color={color ?? def?.color ?? COLORS.textMuted}
      strokeWidth={strokeWidth ?? def?.strokeWidth ?? 1.8}
      fill={fill ?? 'none'}
    />
  );
}

// ── Tab navigation ─────────────────────────────────────────────────────────────
export const IcHome       = mk(Home);
export const IcExplore    = mk(Compass);
export const IcCreate     = mk(Plus, { color: COLORS.white, strokeWidth: 2.5 });
export const IcPlus       = mk(Plus);
export const IcThreads    = mk(List);
export const IcProfile    = mk(User);

// ── Feed actions ──────────────────────────────────────────────────────────────
export const IcHeart      = mk(Heart);
export const IcHeartFill  = ({ size = 22, color = COLORS.like }: IconProps) =>
  <Heart size={size} color={color} strokeWidth={1.8} fill={color} />;
export const IcComment    = mk(MessageCircle);
export const IcShare      = mk(Share2);
export const IcSave       = mk(Bookmark);
export const IcSaveFill   = ({ size = 22, color = COLORS.primary }: IconProps) =>
  <BookmarkCheck size={size} color={color} strokeWidth={1.8} />;

// ── Header / nav ──────────────────────────────────────────────────────────────
export const IcBell       = mk(Bell);
export const IcMail       = mk(Mail);
export const IcSearch     = mk(Search);
export const IcSettings   = mk(Settings);
export const IcBack       = mk(ChevronLeft);
export const IcForward    = mk(ChevronRight);
export const IcDown       = mk(ChevronDown);
export const IcClose      = mk(X);
export const IcCheck      = mk(Check);
export const IcCheckFull  = mk(CheckCircle);
export const IcMore       = mk(MoreHorizontal);
export const IcSend       = mk(Send);

// ── Media ─────────────────────────────────────────────────────────────────────
export const IcPlay       = mk(Play);
export const IcPause      = mk(Pause);
export const IcCamera     = mk(Camera);
export const IcUpload     = mk(Upload);
export const IcImage      = mk(Image);
export const IcVideo      = mk(Video);
export const IcMusic      = mk(Music);
export const IcFilm       = mk(Film);
export const IcBook       = mk(BookOpen);
export const IcInstagram  = mk(Camera);
export const IcWhatsApp   = mk(MessageCircleMore);

// ── Social ────────────────────────────────────────────────────────────────────
export const IcFollow     = mk(UserPlus);
export const IcFollowing  = mk(UserCheck);
export const IcUsers      = mk(Users);
export const IcEye        = mk(Eye);
export const IcTrending   = mk(TrendingUp);
export const IcAt         = mk(AtSign);
export const IcHash       = mk(Hash);
export const IcRepeat     = mk(Repeat2);
export const IcFlag       = mk(Flag);

// ── Settings icons ────────────────────────────────────────────────────────────
export const IcEdit       = mk(Edit3);
export const IcLock       = mk(Lock);
export const IcShield     = mk(Shield);
export const IcGlobe      = mk(Globe);
export const IcMoon       = mk(Moon);
export const IcSun        = mk(Sun);
export const IcVolume     = mk(Volume2);
export const IcMute       = mk(VolumeX);
export const IcLogOut     = mk(LogOut);
export const IcHelp       = mk(HelpCircle);
export const IcTrash      = mk(Trash2);
export const IcStar       = mk(Star);
export const IcAward      = mk(Award);
export const IcZap        = mk(Zap);
export const IcAlert      = mk(AlertCircle);
export const IcInfo       = mk(Info);
export const IcGrid       = mk(Grid);
export const IcChart      = mk(BarChart2);
export const IcSliders    = mk(Sliders);
export const IcClock      = mk(Clock);
export const IcRefresh    = mk(RefreshCw);
export const IcText       = mk(FileText);
export const IcSmile      = mk(Smile);
export const IcFrown      = mk(Frown);
export const IcThumbsUp   = mk(ThumbsUp);

// ── Live / Radio ──────────────────────────────────────────────────────────────
export const IcLive       = mk(Radio);
export const IcPen        = mk(PenLine);
export const IcMaximize    = mk(Maximize2);
export const IcFilterSort  = mk(SlidersHorizontal);
export const IcCornerUpLeft = mk(CornerUpLeft);
export const IcDownload    = mk(Download);
export const IcLink        = mk(Link);
export const IcCopy        = mk(Copy);

// ── Brand icon (moon = symbole islamique propre) ──────────────────────────────
export const IcBrand = ({ size = 32, color = COLORS.primary }: IconProps) =>
  <Moon size={size} color={color} strokeWidth={1.5} fill="none" />;
