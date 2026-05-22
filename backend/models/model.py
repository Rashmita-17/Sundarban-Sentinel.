import torch
import torch.nn as nn
import torch.nn.functional as F

class DoubleConv(nn.Module):
    """(convolution => [BN] => ReLU) * 2"""
    def __init__(self, in_channels, out_channels, mid_channels=None):
        super().__init__()
        if not mid_channels:
            mid_channels = out_channels
        self.double_conv = nn.Sequential(
            nn.Conv2d(in_channels, mid_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(mid_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(mid_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )

    def forward(self, x):
        return self.double_conv(x)

class Down(nn.Module):
    """Downscaling with maxpool then double conv"""
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.maxpool_conv = nn.Sequential(
            nn.MaxPool2d(2),
            DoubleConv(in_channels, out_channels)
        )

    def forward(self, x):
        return self.maxpool_conv(x)

class Up(nn.Module):
    """Upscaling then double conv"""
    def __init__(self, in_channels, out_channels, bilinear=True):
        super().__init__()
        if bilinear:
            self.up = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=True)
            self.conv = DoubleConv(in_channels, out_channels, in_channels // 2)
        else:
            self.up = nn.ConvTranspose2d(in_channels, in_channels // 2, kernel_size=2, stride=2)
            self.conv = DoubleConv(in_channels, out_channels)

    def forward(self, x1, x2):
        x1 = self.up(x1)
        # input is CHW
        diffY = x2.size()[2] - x1.size()[2]
        diffX = x2.size()[3] - x1.size()[3]

        x1 = F.pad(x1, [diffX // 2, diffX - diffX // 2,
                        diffY // 2, diffY - diffY // 2])
        x = torch.cat([x2, x1], dim=1)
        return self.conv(x)

class OutConv(nn.Module):
    def __init__(self, in_channels, out_channels):
        super(OutConv, self).__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=1)

    def forward(self, x):
        return self.conv(x)

class SiameseUNet(nn.Module):
    def __init__(self, n_channels=4, n_classes=1, bilinear=False):
        super(SiameseUNet, self).__init__()
        self.n_channels = n_channels
        self.n_classes = n_classes
        self.bilinear = bilinear

        # Shared Encoder (Siamese)
        self.inc = DoubleConv(n_channels, 64)
        self.down1 = Down(64, 128)
        self.down2 = Down(128, 256)
        self.down3 = Down(256, 512)
        factor = 2 if bilinear else 1
        self.down4 = Down(512, 1024 // factor)

        # Decoder (Expansive path)
        self.up1 = Up(1024, 512 // factor, bilinear)
        self.up2 = Up(512, 256 // factor, bilinear)
        self.up3 = Up(256, 128 // factor, bilinear)
        self.up4 = Up(128, 64, bilinear)
        self.outc = OutConv(64, n_classes)

    def forward(self, x1, x2):
        # x1 and x2 are the two images (e.g., T1 and T2)
        
        # Encoder path for x1
        x1_1 = self.inc(x1)
        x1_2 = self.down1(x1_1)
        x1_3 = self.down2(x1_2)
        x1_4 = self.down3(x1_3)
        x1_5 = self.down4(x1_4)

        # Encoder path for x2
        x2_1 = self.inc(x2)
        x2_2 = self.down1(x2_1)
        x2_3 = self.down2(x2_2)
        x2_4 = self.down3(x2_3)
        x2_5 = self.down4(x2_4)

        # Difference Fusion at each level (Change detection feature)
        # Using absolute difference as the fusion mechanism
        d1 = torch.abs(x1_1 - x2_1)
        d2 = torch.abs(x1_2 - x2_2)
        d3 = torch.abs(x1_3 - x2_3)
        d4 = torch.abs(x1_4 - x2_4)
        d5 = torch.abs(x1_5 - x2_5)

        # Decoder path using the difference features
        x = self.up1(d5, d4)
        x = self.up2(x, d3)
        x = self.up3(x, d2)
        x = self.up4(x, d1)
        logits = self.outc(x)
        
        # Return sigmoid for binary mask
        return torch.sigmoid(logits)
