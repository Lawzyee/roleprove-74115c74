import * as React from 'react';
import { Body,Button,Container,Head,Heading,Html,Preview,Text } from '@react-email/components';
import { absoluteUrl } from '../site-url';
import type { TemplateEntry } from './registry';
export function StaffReviewEmail(){return <Html lang="en"><Head/><Preview>A new item is waiting for review</Preview><Body style={{backgroundColor:'#ffffff',fontFamily:'Arial, sans-serif'}}><Container style={{padding:'24px 28px'}}><Heading>RoleProve</Heading><Text>A new item is waiting for review.</Text><Button href={absoluteUrl('/admin/review')}>Open staff review</Button></Container></Body></Html>;}
export const template={component:StaffReviewEmail,subject:'A new item is waiting for review',to:'support@roleprove.com',displayName:'Staff review notice',previewData:{}} satisfies TemplateEntry;
