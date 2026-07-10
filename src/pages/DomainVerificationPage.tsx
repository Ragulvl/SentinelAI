import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { websiteScanService, VerifiedDomain, VerificationInstructions } from '@/services/websiteScan.service';
import { useToast } from '@/hooks/use-toast';
import { Shield, CheckCircle, XCircle, Clock, Trash2, FileText, Globe, Code } from 'lucide-react';

export default function DomainVerificationPage() {
  const [domains, setDomains] = useState<VerifiedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [verificationMethod, setVerificationMethod] = useState<'file' | 'dns' | 'meta'>('file');
  const [instructions, setInstructions] = useState<VerificationInstructions | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    try {
      setLoading(true);
      const data = await websiteScanService.getVerifiedDomains();
      setDomains(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load domains',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateVerification = async () => {
    if (!newDomain.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a domain',
        variant: 'destructive',
      });
      return;
    }

    try {
      setVerifying(true);
      const result = await websiteScanService.initiateVerification(newDomain, verificationMethod);
      setInstructions(result);
      toast({
        title: 'Verification Initiated',
        description: 'Follow the instructions below to verify your domain',
      });
      await loadDomains();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to initiate verification',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleAddOwnedDomain = async () => {
    if (!newDomain.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a domain',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm(`Confirm adding "${newDomain}" as an owned domain without verification. Make sure you are authorized to run security scans against this host.`)) {
      return;
    }

    try {
      setVerifying(true);
      const result = await websiteScanService.addOwnedDomain(newDomain);
      
      if (result.success) {
        toast({
          title: 'Success',
          description: result.message,
        });
        setNewDomain('');
        setInstructions(null);
        await loadDomains();
      } else {
        toast({
          title: 'Error',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add domain',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyDomain = async (domain: string) => {
    try {
      setVerifying(true);
      const result = await websiteScanService.verifyDomain(domain);
      
      if (result.success) {
        toast({
          title: 'Success',
          description: result.message,
        });
        setInstructions(null);
        await loadDomains();
      } else {
        toast({
          title: 'Verification Failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to verify domain',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleDeleteDomain = async (domain: string) => {
    if (!confirm(`Are you sure you want to remove ${domain}?`)) {
      return;
    }

    try {
      await websiteScanService.deleteDomain(domain);
      toast({
        title: 'Success',
        description: 'Domain removed successfully',
      });
      await loadDomains();
      if (instructions?.domain === domain) {
        setInstructions(null);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete domain',
        variant: 'destructive',
      });
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'file':
        return <FileText className="h-4 w-4" />;
      case 'dns':
        return <Globe className="h-4 w-4" />;
      case 'meta':
        return <Code className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-black">
    <Navigation />
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Domain Verification</h1>
            <p className="text-muted-foreground">Verify ownership before scanning your websites</p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add New Domain</CardTitle>
            <CardDescription>
              Confirm your ownership of a domain to enable external vulnerability scanning.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="domain">Domain or URL</Label>
                <Input
                  id="domain"
                  placeholder="example.com or https://example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  disabled={verifying}
                />
              </div>

              <div>
                <Label>Verification Method</Label>
                <Tabs value={verificationMethod} onValueChange={(v) => setVerificationMethod(v as any)}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="file">File Upload</TabsTrigger>
                    <TabsTrigger value="meta">Meta Tag</TabsTrigger>
                    <TabsTrigger value="dns">DNS Record</TabsTrigger>
                  </TabsList>
                  <TabsContent value="file" className="mt-4">
                    <p className="text-sm text-muted-foreground">
                      Place the authorization file within the web root of your target host.
                    </p>
                  </TabsContent>
                  <TabsContent value="meta" className="mt-4">
                    <p className="text-sm text-muted-foreground">
                      Embed a verification metadata tag into the main HTML head of your index page.
                    </p>
                  </TabsContent>
                  <TabsContent value="dns" className="mt-4">
                    <p className="text-sm text-muted-foreground">
                      Publish a TXT record containing the verification token in your DNS configuration.
                    </p>
                  </TabsContent>
                </Tabs>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleInitiateVerification} disabled={verifying}>
                  {verifying ? 'Processing...' : 'Start Verification'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleAddOwnedDomain} 
                  disabled={verifying}
                  className="border-primary/50 hover:bg-primary/10"
                >
                  {verifying ? 'Adding...' : 'Quick Add (Skip Verification)'}
                </Button>
              </div>

              <Alert>
                <AlertDescription className="text-xs text-muted-foreground">
                  Use "Quick Add" to bypass checks for environments under local testing or development.
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>

        {instructions && (
          <Alert className="mb-6">
            <AlertDescription>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Verification Instructions</h3>
                  <pre className="bg-muted p-4 rounded-md text-sm whitespace-pre-wrap">
                    {instructions.instructions}
                  </pre>
                </div>
                <Button onClick={() => handleVerifyDomain(instructions.domain)} disabled={verifying}>
                  {verifying ? 'Verifying...' : 'Verify Ownership'}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Your Domains</CardTitle>
            <CardDescription>Manage your verified and pending domains</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Loading domains...</p>
            ) : domains.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No domains added yet. Add a domain above to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {domains.map((domain) => (
                  <div
                    key={domain._id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {domain.verified ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <Clock className="h-5 w-5 text-yellow-500" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{domain.domain}</span>
                          {domain.verified ? (
                            <Badge variant="default">Verified</Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {getMethodIcon(domain.verificationMethod)}
                            <span>{domain.verificationMethod.toUpperCase()}</span>
                          </div>
                        </div>
                        {domain.verifiedAt && (
                          <p className="text-sm text-muted-foreground">
                            Verified on {new Date(domain.verifiedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!domain.verified && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleVerifyDomain(domain.domain)}
                          disabled={verifying}
                        >
                          Verify
                        </Button>
                      )}
                      {domain.verified && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/website-scan?url=https://${domain.domain}`)}
                        >
                          Scan
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteDomain(domain.domain)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
